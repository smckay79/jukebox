import Foundation

enum Configuration {
    static let baseURL: String = {
        if let url = Bundle.main.infoDictionary?["VIDEOJAM_BASE_URL"] as? String, !url.isEmpty {
            return url
        }
        return "https://videojam.net"
    }()
}
