package com.michaelovsky.codexsubscription.isolated;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.widget.Toast;

public final class StopActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (checkSelfPermission("com.termux.permission.RUN_COMMAND") != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Open Codex Frontier once to grant Termux access", Toast.LENGTH_LONG).show();
            finishAffinity();
            return;
        }
        try {
            RuntimeContract.requestRuntimeStop(this);
            Toast.makeText(this, "Stopping Codex Frontier", Toast.LENGTH_SHORT).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, "Could not request runtime stop", Toast.LENGTH_LONG).show();
        }
        finishAffinity();
    }
}
