import AVFoundation
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = MicrophoneController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class MicrophoneController: UIViewController {
    private let engine = AVAudioEngine()
    private let status = UILabel()
    private let detail = UILabel()
    private let button = UIButton(type: .system)
    private var listening = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        status.text = "Ready"
        status.accessibilityIdentifier = "audio-result"
        status.font = .preferredFont(forTextStyle: .largeTitle)
        detail.font = .monospacedSystemFont(ofSize: 16, weight: .regular)
        button.setTitle("Listen", for: .normal)
        button.addTarget(self, action: #selector(listen), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [status, detail, button])
        stack.axis = .vertical
        stack.spacing = 30
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    @objc private func listen() {
        guard !listening else { return }
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                if granted { self.startCapture() }
                else { self.status.text = "Microphone permission denied" }
            }
        }
    }

    private func startCapture() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement)
            try session.setActive(true)
            let input = engine.inputNode
            let format = input.inputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
                guard let values = buffer.floatChannelData?[0], buffer.frameLength > 1 else { return }
                let count = Int(buffer.frameLength)
                var energy = 0.0
                var crossings = 0
                for i in 0..<count {
                    energy += Double(values[i] * values[i])
                    if i > 0 && (values[i - 1] < 0) != (values[i] < 0) { crossings += 1 }
                }
                let rms = sqrt(energy / Double(count))
                let frequency = Double(crossings) * format.sampleRate / (2 * Double(count))
                let label = rms < 0.01 ? "Silence" : (400...480).contains(frequency) ? "440 Hz detected" : (950...1050).contains(frequency) ? "1000 Hz detected" : "Other audio"
                DispatchQueue.main.async {
                    self?.status.text = label
                    self?.detail.text = String(format: "RMS %.3f | %.0f Hz", rms, frequency)
                }
            }
            do { try engine.start() }
            catch {
                input.removeTap(onBus: 0)
                throw error
            }
            listening = true
            button.isEnabled = false
            status.text = "Listening"
        } catch {
            status.text = "Capture failed"
            detail.text = error.localizedDescription
        }
    }
}
