import Foundation
import SwiftUI

struct RecentParty: Codable, Identifiable {
    let code: String
    let name: String
    let joinedAt: Date
    let adminKey: String?

    var id: String { code }
}

class PartyCodeStore: ObservableObject {
    @Published var currentCode: String?
    @Published var adminKey: String?
    @Published var history: [RecentParty] = []

    private let defaults = UserDefaults.standard
    private let codeKey = "videojam_code"
    private let adminKeyKey = "videojam_admin_key"
    private let historyKey = "videojam_history"
    private let maxHistory = 10

    init() {
        currentCode = defaults.string(forKey: codeKey)
        adminKey = defaults.string(forKey: adminKeyKey)
        loadHistory()
    }

    func setCode(_ code: String) {
        let normalized = code.uppercased().trimmingCharacters(in: .whitespaces)
        currentCode = normalized
        defaults.set(normalized, forKey: codeKey)
    }

    func setAdminKey(_ key: String) {
        adminKey = key
        defaults.set(key, forKey: adminKeyKey)
    }

    func clear() {
        currentCode = nil
        adminKey = nil
        defaults.removeObject(forKey: codeKey)
        defaults.removeObject(forKey: adminKeyKey)
    }

    func addToHistory(code: String, name: String, adminKey: String? = nil) {
        let normalized = code.uppercased()
        var items = history.filter { $0.code != normalized }
        items.insert(
            RecentParty(code: normalized, name: name, joinedAt: Date(), adminKey: adminKey),
            at: 0
        )
        if items.count > maxHistory {
            items = Array(items.prefix(maxHistory))
        }
        history = items
        saveHistory()
    }

    private func loadHistory() {
        guard let data = defaults.data(forKey: historyKey) else { return }
        history = (try? JSONDecoder().decode([RecentParty].self, from: data)) ?? []
    }

    private func saveHistory() {
        if let data = try? JSONEncoder().encode(history) {
            defaults.set(data, forKey: historyKey)
        }
    }
}
