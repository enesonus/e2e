import AVFoundation
import CoreImage
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ScannerController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class ScannerController: UIViewController, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "camera")
    private let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: CIContext(), options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
    private let status = UILabel()
    private var preview: AVCaptureVideoPreviewLayer?
    private var lastCode: String?
    private var frames = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.text = "Waiting for code"
        status.accessibilityIdentifier = "scan-result"
        status.font = .preferredFont(forTextStyle: .title1)
        status.textAlignment = .center
        status.numberOfLines = 0
        status.backgroundColor = .systemBackground
        view.addSubview(status)
        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard let self else { return }
            if granted { self.queue.async { self.startCamera() } }
            else { DispatchQueue.main.async { self.status.text = "Camera permission denied" } }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
        status.frame = CGRect(x: 20, y: view.safeAreaInsets.top + 20, width: view.bounds.width - 40, height: 100)
    }

    private func startCamera() {
        do {
            guard let camera = AVCaptureDevice.default(for: .video) else { throw CameraError.unavailable }
            let input = try AVCaptureDeviceInput(device: camera)
            guard session.canAddInput(input) else { throw CameraError.unavailable }
            session.beginConfiguration()
            session.sessionPreset = .medium
            session.addInput(input)
            let output = AVCaptureVideoDataOutput()
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            guard session.canAddOutput(output) else { throw CameraError.unavailable }
            session.addOutput(output)
            session.commitConfiguration()
            DispatchQueue.main.async {
                let layer = AVCaptureVideoPreviewLayer(session: self.session)
                layer.videoGravity = .resizeAspectFill
                self.view.layer.insertSublayer(layer, at: 0)
                self.preview = layer
                self.view.setNeedsLayout()
            }
            session.startRunning()
            queue.asyncAfter(deadline: .now() + 3) {
                if self.frames == 0 {
                    DispatchQueue.main.async { self.status.text = "No camera input" }
                }
            }
        } catch {
            DispatchQueue.main.async { self.status.text = "Camera unavailable" }
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput buffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
        frames += 1
        if frames == 45 && lastCode == nil {
            DispatchQueue.main.async { self.status.text = "No code detected" }
        }
        let image = CIImage(cvPixelBuffer: pixels)
        guard let code = detector.features(in: image).compactMap({ ($0 as? CIQRCodeFeature)?.messageString }).first,
              code != lastCode else { return }
        lastCode = code
        DispatchQueue.main.async {
            self.status.text = code == "e2e://camera/accepted" ? "Code accepted" : "Unsupported code"
        }
    }

    private enum CameraError: Error { case unavailable }
}
