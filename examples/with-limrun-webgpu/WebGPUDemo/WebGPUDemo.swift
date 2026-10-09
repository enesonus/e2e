import SwiftUI
import WebKit

struct GPUView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        let page = Bundle.main.url(forResource: "index", withExtension: "html")!
        view.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}

@main
struct WebGPUDemoApp: App {
    var body: some Scene {
        WindowGroup { GPUView() }
    }
}
