import { toast } from '../../../components/toast/toast';

/** Field-staff alias for the shared toast API. */
export function pushToast(item: {
  type: 'job' | 'approval' | 'rejection' | 'info';
  title: string;
  body: string;
}) {
  if (item.type === 'approval') toast.success({ title: item.title, body: item.body });
  else if (item.type === 'rejection') toast.warning({ title: item.title, body: item.body });
  else toast.info({ title: item.title, body: item.body });
}
