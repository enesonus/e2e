package dev.e2e.microphone;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Locale;

public final class MainActivity extends Activity {
    private TextView status;
    private TextView detail;
    private Button button;
    private volatile boolean listening;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        status = new TextView(this);
        status.setTextSize(28);
        status.setText("Ready");
        detail = new TextView(this);
        button = new Button(this);
        button.setText("Listen");
        button.setOnClickListener(view -> {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 1);
            } else startCapture();
        });
        layout.addView(status);
        layout.addView(detail);
        layout.addView(button);
        setContentView(layout);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startCapture();
        else status.setText("Microphone permission denied");
    }

    private void startCapture() {
        if (listening) return;
        listening = true;
        button.setEnabled(false);
        status.setText("Listening");
        new Thread(() -> {
            AudioRecord recorder = null;
            try {
                int rate = 48000;
                int size = Math.max(8192, AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT));
                recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
                recorder.startRecording();
                short[] samples = new short[4096];
                while (listening) {
                    int count = recorder.read(samples, 0, samples.length);
                    if (count <= 0) throw new IllegalStateException("AudioRecord read: " + count);
                    double energy = 0;
                    int crossings = 0;
                    for (int i = 0; i < count; i++) {
                        double value = samples[i] / 32768.0;
                        energy += value * value;
                        if (i > 0 && (samples[i - 1] < 0) != (samples[i] < 0)) crossings++;
                    }
                    double rms = Math.sqrt(energy / count);
                    double frequency = crossings * rate / (2.0 * count);
                    String label = rms < 0.01 ? "Silence" : frequency >= 400 && frequency <= 480 ? "440 Hz detected" : frequency >= 950 && frequency <= 1050 ? "1000 Hz detected" : "Other audio";
                    runOnUiThread(() -> {
                        status.setText(label);
                        detail.setText(String.format(Locale.ROOT, "RMS %.3f | %.0f Hz", rms, frequency));
                    });
                }
            } catch (Exception error) {
                runOnUiThread(() -> { status.setText("Capture failed"); detail.setText(error.toString()); });
            } finally {
                if (recorder != null) { recorder.release(); }
                listening = false;
                runOnUiThread(() -> button.setEnabled(true));
            }
        }, "microphone").start();
    }

    @Override protected void onDestroy() {
        listening = false;
        super.onDestroy();
    }
}
