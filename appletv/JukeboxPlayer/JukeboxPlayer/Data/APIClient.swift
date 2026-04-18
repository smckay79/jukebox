import Foundation

enum APIClient {
    private static let pipedInstances = [
        "https://api.piped.private.coffee",
        "https://pipedapi.darkness.services",
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
        for instance in pipedInstances {
            if let result = await fetchFromPiped(videoId: videoId, instance: instance) {
                return result
            }
        }
        print("[VideoURL] All sources failed for \(videoId)")
        return nil
    }

    private static func fetchFromPiped(videoId: String, instance: String) async -> (url: String, type: String)? {
        guard let url = URL(string: "\(instance)/streams/\(videoId)") else { return nil }
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

            if let hls = json["hls"] as? String, !hls.isEmpty {
                print("[VideoURL] Got HLS from \(instance)")
                return (hls, "hls")
            }

            if let streams = json["videoStreams"] as? [[String: Any]] {
                let combined = streams.filter { !($0["videoOnly"] as? Bool ?? true) }
                let mp4 = combined.filter {
                    ($0["format"] as? String) == "MPEG_4" ||
                    (($0["mimeType"] as? String) ?? "").contains("video/mp4")
                }
                let best = (mp4.isEmpty ? combined : mp4)
                    .sorted { (parseInt($0["quality"]) ?? 0) > (parseInt($1["quality"]) ?? 0) }
                if let first = best.first, let streamUrl = first["url"] as? String {
                    let quality = first["quality"] as? String ?? "unknown"
                    print("[VideoURL] Got \(quality) stream from \(instance)")
                    return (streamUrl, "mp4")
                }
            }

            print("[VideoURL] \(instance) had no usable streams")
        } catch {
            print("[VideoURL] \(instance) error: \(error.localizedDescription)")
        }
        return nil
    }

    private static func parseInt(_ value: Any?) -> Int? {
        if let str = value as? String {
            return Int(str.replacingOccurrences(of: "p", with: ""))
        }
        return value as? Int
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
