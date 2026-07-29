import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TABLES = [
  'profiles', 'services', 'bookings', 'booking_presets', 'booking_status_history',
  'documents', 'favorites', 'messages', 'notifications', 'reviews',
  'referrals', 'user_preferences',
  'smart_sort_plans', 'smart_sort_subscriptions', 'smart_sort_pickups',
  'smart_sort_invoices', 'smart_sort_payments',
  'wallet_transactions', 'procurement_requests',
  'employees', 'hr_roles', 'hr_role_permissions', 'id_cards',
  'employee_activity_logs',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const backupData: Record<string, any> = {};
    const tableCounts: Record<string, number> = {};
    const failedTables: string[] = [];

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        failedTables.push(table);
        backupData[table] = [];
        tableCounts[table] = 0;
      } else {
        backupData[table] = data;
        tableCounts[table] = data.length;
      }
    }

    const payload = {
      metadata: {
        exported_at: new Date().toISOString(),
        exported_by: user.id,
        table_count: TABLES.length,
        total_rows: Object.values(tableCounts).reduce((a: number, b: number) => a + b, 0),
        failed_tables: failedTables,
      },
      data: backupData,
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const bytes = new TextEncoder().encode(jsonStr);
    const fileBuffer = bytes.buffer;
    const fileSize = bytes.byteLength;

    const fileName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const storagePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(storagePath, fileBuffer, {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Failed to store backup: ${uploadError.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: logError } = await supabase.from('backup_history').insert({
      created_by: user.id,
      tables_included: TABLES,
      table_counts,
      file_size_bytes: fileSize,
      status: 'completed',
      storage_path: storagePath,
    });

    if (logError) {
      console.error('Failed to log backup:', logError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      file_name: fileName,
      storage_path: storagePath,
      file_size_bytes: fileSize,
      table_counts: tableCounts,
      total_rows: payload.metadata.total_rows,
      failed_tables: failedTables,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
