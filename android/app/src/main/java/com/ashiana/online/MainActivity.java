package com.ashiana.online;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;
import com.google.android.gms.tasks.Task;

public class MainActivity extends BridgeActivity {
    private static final int UPDATE_REQUEST_CODE = 9001;
    private AppUpdateManager appUpdateManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        checkForUpdates();

        final WebView webView = this.bridge.getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            if (settings != null) {
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
            }

            // Explicitly enable Android Autofill service integration for the WebView
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_YES);
            }
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void printPage() {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            if (printManager != null) {
                                PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter("Prescription Document");
                                String jobName = getString(com.ashiana.online.R.string.app_name) + " Print Job";
                                printManager.print(jobName, printAdapter, new PrintAttributes.Builder().build());
                            }
                        }
                    });
                }
            }, "AndroidPrint");
        }
    }

    private void checkForUpdates() {
        appUpdateManager = AppUpdateManagerFactory.create(this);
        Task<AppUpdateInfo> appUpdateInfoTask = appUpdateManager.getAppUpdateInfo();

        appUpdateInfoTask.addOnSuccessListener(appUpdateInfo -> {
            if (appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
                    && appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
                try {
                    appUpdateManager.startUpdateFlowForResult(
                            appUpdateInfo,
                            AppUpdateType.IMMEDIATE,
                            this,
                            UPDATE_REQUEST_CODE);
                } catch (Exception e) {
                    Log.e("AppUpdate", "Update flow failed", e);
                }
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        if (appUpdateManager != null) {
            appUpdateManager.getAppUpdateInfo().addOnSuccessListener(appUpdateInfo -> {
                if (appUpdateInfo.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                    try {
                        appUpdateManager.startUpdateFlowForResult(
                                appUpdateInfo,
                                AppUpdateType.IMMEDIATE,
                                this,
                                UPDATE_REQUEST_CODE);
                    } catch (Exception e) {
                        Log.e("AppUpdate", "Resume flow failed", e);
                    }
                }
            });
        }
    }
}
