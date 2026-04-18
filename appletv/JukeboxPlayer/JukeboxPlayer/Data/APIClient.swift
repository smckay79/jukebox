import Foundation

enum APIClient {
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

    static func fetchVideoURL(baseURL: String, code: String, videoId: String) async -> (url: String, type: String)? {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        guard let url = URL(string: "\(baseURL)/api/party/\(normalized)/video-url?v=\(videoId)") else {
            return nil
        }
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 15
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let streamURL = json["url"] as? String,
               let type = json["type"] as? String {
                return (streamURL, type)
            }
        } catch { }
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
