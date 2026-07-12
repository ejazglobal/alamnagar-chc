package com.alamnagar.chc;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        final WebView webView = this.bridge.getWebView();
        if (webView != null) {
            // Explicitly enable Android Autofill service integration for the WebView
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_YES);
            }
            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.addJavascriptInterface(new Object() {
                        @JavascriptInterface
                        public void printPage() {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                    if (printManager != null) {
                                        PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter("Prescription Document");
                                        String jobName = getString(R.string.app_name) + " Print Job";
                                        printManager.print(jobName, printAdapter, new PrintAttributes.Builder().build());
                                    }
                                }
                            });
                        }
                    }, "AndroidPrint");
                }
            });
        }
    }
}
