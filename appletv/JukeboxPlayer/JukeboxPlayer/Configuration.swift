import Foundation

enum Configuration {
    static let baseURL: String = {
        if let url = Bundle.main.infoDictionary?["JUKEBOX_BASE_URL"] as? String, !url.isEmpty {
            return url
        }
        return "https://jukebox-delta-three.vercel.app"
    }()
}
