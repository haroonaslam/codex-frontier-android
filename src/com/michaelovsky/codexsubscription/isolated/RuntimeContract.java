package com.michaelovsky.codexsubscription.isolated;

import android.content.Context;
import android.content.Intent;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

final class RuntimeContract {
    static final String APP_HOME = "/data/data/com.termux/files/home/codex-subscription-isolated-app";
    static final String START_SCRIPT = APP_HOME + "/codex-frontier-start.sh";
    static final String STOP_SCRIPT = APP_HOME + "/codex-frontier-stop.sh";
    static final String WEB_URL = "http://127.0.0.1:5902/";
    static final String HEALTH_URL = WEB_URL + "codex-api/meta/methods";
    static final String COMPLETION_EVENTS_URL = WEB_URL + "codex-api/frontier-completion-events";
    static final String TERMUX_PACKAGE = "com.termux";
    static final String TERMUX_SERVICE = "com.termux.app.RunCommandService";
    private RuntimeContract() { }

    private static Intent createTermuxCommandIntent(String path, String label, String description) {
        Intent command = new Intent("com.termux.RUN_COMMAND");
        command.setClassName(TERMUX_PACKAGE, TERMUX_SERVICE);
        command.putExtra("com.termux.RUN_COMMAND_PATH", path);
        command.putExtra("com.termux.RUN_COMMAND_WORKDIR", APP_HOME);
        command.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
        command.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0");
        command.putExtra("com.termux.RUN_COMMAND_LABEL", label);
        command.putExtra("com.termux.RUN_COMMAND_DESCRIPTION", description);
        return command;
    }

    static void requestRuntimeStart(Context context) {
        context.startService(createTermuxCommandIntent(
                START_SCRIPT,
                "Codex Frontier runtime",
                "Starts the isolated Codex Frontier runtime on loopback port 5902."));
    }

    static void requestRuntimeStop(Context context) {
        context.startService(createTermuxCommandIntent(
                STOP_SCRIPT,
                "Stop Codex Frontier",
                "Stops only the verified isolated Codex Frontier runtime."));
    }

    static boolean runtimeIsReady() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(HEALTH_URL).openConnection();
            connection.setConnectTimeout(1200);
            connection.setReadTimeout(1800);
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            return connection.getResponseCode() == 200;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static CompletionBatch readCompletionEvents(long afterSequence) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(COMPLETION_EVENTS_URL + "?after=" + Math.max(0L, afterSequence));
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(1200);
            connection.setReadTimeout(1800);
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            if (connection.getResponseCode() != 200) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null && body.length() < 262144) body.append(line);
            reader.close();
            JSONObject data = new JSONObject(body.toString()).getJSONObject("data");
            long latestSequence = data.optLong("latestSequence", 0L);
            JSONArray rows = data.optJSONArray("events");
            List<CompletionEvent> events = new ArrayList<CompletionEvent>();
            if (rows != null) {
                for (int index = 0; index < rows.length(); index++) {
                    JSONObject row = rows.optJSONObject(index);
                    if (row == null) continue;
                    long sequence = row.optLong("sequence", 0L);
                    String threadId = row.optString("threadId", "");
                    String turnId = row.optString("turnId", "");
                    if (sequence < 1L || threadId.isEmpty() || turnId.isEmpty()) continue;
                    events.add(new CompletionEvent(sequence, threadId, turnId, row.optString("status", "completed")));
                }
            }
            return new CompletionBatch(latestSequence, events);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static final class CompletionBatch {
        final long latestSequence;
        final List<CompletionEvent> events;
        CompletionBatch(long latestSequence, List<CompletionEvent> events) {
            this.latestSequence = latestSequence;
            this.events = events;
        }
    }

    static final class CompletionEvent {
        final long sequence;
        final String threadId;
        final String turnId;
        final String status;
        CompletionEvent(long sequence, String threadId, String turnId, String status) {
            this.sequence = sequence;
            this.threadId = threadId;
            this.turnId = turnId;
            this.status = status;
        }
    }
}
