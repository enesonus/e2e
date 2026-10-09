package dev.e2e.camera;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.*;
import android.view.Gravity;
import android.widget.*;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.nio.ByteBuffer;
import java.util.Collections;

public class MainActivity extends Activity {
    private final HandlerThread thread = new HandlerThread("camera");
    private Handler handler;
    private TextView status;
    private ImageView preview;
    private CameraDevice camera;
    private ImageReader reader;
    private int frames = 0;
    private boolean decoded = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(24, 100, 24, 24);
        status = new TextView(this);
        status.setText("Waiting for code");
        status.setTextSize(28);
        status.setGravity(Gravity.CENTER);
        layout.addView(status);
        preview = new ImageView(this);
        layout.addView(preview, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        thread.start();
        handler = new Handler(thread.getLooper());
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera();
        else requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) startCamera();
        else status.setText("Camera permission denied");
    }

    private void startCamera() {
        try {
            CameraManager manager = getSystemService(CameraManager.class);
            String id = manager.getCameraIdList()[0];
            reader = ImageReader.newInstance(640, 480, ImageFormat.YUV_420_888, 2);
            reader.setOnImageAvailableListener(source -> {
                try (Image image = source.acquireLatestImage()) {
                    if (image == null) return;
                    readFrame(image);
                }
            }, handler);
            manager.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice device) {
                    camera = device;
                    try {
                        device.createCaptureSession(Collections.singletonList(reader.getSurface()), new CameraCaptureSession.StateCallback() {
                            @Override public void onConfigured(CameraCaptureSession session) {
                                try {
                                    CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                                    request.addTarget(reader.getSurface());
                                    session.setRepeatingRequest(request.build(), null, handler);
                                } catch (CameraAccessException error) { show("Camera unavailable"); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession session) { show("Camera unavailable"); }
                        }, handler);
                    } catch (CameraAccessException error) { show("Camera unavailable"); }
                }
                @Override public void onDisconnected(CameraDevice device) { device.close(); }
                @Override public void onError(CameraDevice device, int error) { device.close(); show("Camera unavailable"); }
            }, handler);
            handler.postDelayed(() -> { if (frames == 0) show("No camera input"); }, 3000);
        } catch (Exception error) { show("Camera unavailable"); }
    }

    private void readFrame(Image image) {
        frames++;
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int width = image.getWidth(), height = image.getHeight();
        byte[] luminance = new byte[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) luminance[y * width + x] = buffer.get(y * plane.getRowStride() + x * plane.getPixelStride());
        }
        if (frames % 5 == 0) {
            int[] colors = new int[luminance.length];
            for (int i = 0; i < colors.length; i++) { int value = luminance[i] & 255; colors[i] = 0xff000000 | value << 16 | value << 8 | value; }
            Bitmap bitmap = Bitmap.createBitmap(colors, width, height, Bitmap.Config.ARGB_8888);
            runOnUiThread(() -> preview.setImageBitmap(bitmap));
        }
        try {
            LuminanceSource source = new PlanarYUVLuminanceSource(luminance, width, height, 0, 0, width, height, false);
            String code = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
            decoded = true;
            show(code.equals("e2e://camera/accepted") ? "Code accepted" : "Unsupported code");
        } catch (ReaderException noCode) {
            if (frames >= 45 && !decoded) show("No code detected");
        }
    }

    private void show(String text) { runOnUiThread(() -> status.setText(text)); }

    @Override protected void onDestroy() {
        if (camera != null) camera.close();
        if (reader != null) reader.close();
        thread.quitSafely();
        super.onDestroy();
    }
}
