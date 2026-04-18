import Foundation

enum APIClient {
    private static let invidiousInstances = [
        "https://invidious.darkness.services",
        "https://invidious.private.coffee",
    ]

    static func fetchPartyName(baseURL: String, code: String) async -> String {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: "\(baseURL)/api/party/\(normalized)") else {
            return "Party"
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 5
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return "Party"
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let name = json["name"] as? String {
                return name
            }
        } catch { }
        return "Party"
    }

    static func verifyPin(baseURL: String, code: String, pin: String) async -> String? {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: "\(baseURL)/api/party/\(normalized)/verify-pin") else {
            return nil
        }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["pin": pin])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let key = json["adminKey"] as? String {
                return key
            }
        } catch { }
        return nil
    }

    static func fetchVideoURL(videoId: String) async -> (url: String, type: String)? {
        for instance in invidiousInstances {
            if let result = await fetchFromInvidious(videoId: videoId, instance: instance) {
                return result
            }
        }
        print("[VideoURL] All sources failed for \(videoId)")
        return nil
    }

    private static func fetchFromInvidious(videoId: String, instance: String) async -> (url: String, type: String)? {
        guard let url = URL(string: "\(instance)/api/v1/videos/\(videoId)?fields=formatStreams,adaptiveFormats") else {
            return nil
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            print("[VideoURL] Trying \(instance)...")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                print("[VideoURL] \(instance) returned \((response as? HTTPURLResponse)?.statusCode ?? 0)")
                return nil
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("[VideoURL] \(instance) returned invalid JSON")
                return nil
            }

            if let formats = json["formatStreams"] as? [[String: Any]] {
                let mp4 = formats.filter { ($0["container"] as? String) == "mp4" }
                if let best = mp4.last, let itag = best["itag"] as? String {
                    let proxyUrl = "\(instance)/latest_version?id=\(videoId)&itag=\(itag)"
                    let quality = best["qualityLabel"] as? String ?? "unknown"
                    print("[VideoURL] Got \(quality) via \(instance) (itag \(itag))")
                    return (proxyUrl, "mp4")
                }
            }

            print("[VideoURL] \(instance) had no usable MP4 streams")
        } catch {
            print("[VideoURL] \(instance) error: \(error.localizedDescription)")
        }
        return nil
    }

    static func skipSong(baseURL: String, code: String, adminKey: String) async {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: "\(baseURL)/api/party/\(normalized)/admin") else { return }
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 5
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(adminKey, forHTTPHeaderField: "x-admin-key")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["action": "skip"])
            _ = try await URLSession.shared.data(for: request)
        } catch { }
    }
}
