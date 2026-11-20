// Runs in the cloud build after "cap add android".
// 1) lets other apps share links/text/files to Leaf Reader  2) passes shared text to the web page.
const fs = require('fs');
const path = require('path');

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(manifestPath, 'utf8');
const filters = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
        </activity>`;
m = m.replace('</activity>', filters);
fs.writeFileSync(manifestPath, m);

const javaRoot = 'android/app/src/main/java/com/leafreader/app';
fs.mkdirSync(javaRoot, { recursive: true });
fs.writeFileSync(path.join(javaRoot, 'MainActivity.java'), `package com.leafreader.app;

import android.content.Intent;
import androidx.activity.OnBackPressedCallback;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("(window.__back ? window.__back() : false)", v -> {
                    if (!"true".equals(v)) moveTaskToBack(true);
                });
            }
        });
        new Handler(Looper.getMainLooper()).postDelayed(() -> pass(getIntent()), 1500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        pass(intent);
    }

    private void pass(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) return;
        intent.setAction(null);
        final String js = "(window.__q=window.__q||[]).push(" + JSONObject.quote(text) + ");window.__shared&&window.__shared();";
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
    }
}
`);
