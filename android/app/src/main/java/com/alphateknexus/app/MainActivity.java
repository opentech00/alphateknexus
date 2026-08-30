package com.alphateknexus.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import androidx.core.splashscreen.SplashScreen;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                // Initialize with dummy options if google-services.json is missing
                // to prevent the PushNotifications plugin from crashing the app.
                FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApplicationId("1:dummy:android:dummy")
                    .setApiKey("dummy")
                    .setProjectId("dummy")
                    .build();
                FirebaseApp.initializeApp(this, options);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
