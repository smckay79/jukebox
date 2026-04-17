import SwiftUI
import WebKit

struct PlayerScreen: View {
    let code: String
    let baseURL: String
    let adminKey: String?
    let onExit: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            WebView(url: URL(string: "\(baseURL)/party/\(code.uppercased())/display")!)
                .ignoresSafeArea()

            // Admin skip button — bottom-right, same placement as Android
            if let adminKey = adminKey {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button(action: {
                            Task { await APIClient.skipSong(baseURL: baseURL, code: code, adminKey: adminKey) }
                        }) {
                            Text("Skip")
                                .font(.caption)
                                .fontWeight(.medium)
                                .foregroundColor(.white.opacity(0.7))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.12))
                                .cornerRadius(8)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 16)
                        .padding(.bottom, 8)
                    }
                }
            }
        }
        // Keep screen on while playing
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        // Menu button exits back to code entry
        .onExitCommand { onExit() }
    }
}

// WKWebView wrapper for tvOS
struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(baseHost: url.host)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        let baseHost: String?

        init(baseHost: String?) {
            self.baseHost = baseHost
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if let host = navigationAction.request.url?.host, host != baseHost {
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
