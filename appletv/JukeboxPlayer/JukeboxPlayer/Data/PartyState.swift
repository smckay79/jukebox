import Foundation

struct PartySong: Codable {
    let id: String
    let videoId: String
    let title: String
    let thumbnail: String
    let addedBy: String
    let addedByUserId: String
    let addedAt: Double
    let votes: [String]
    let downvotes: [String]?
    let source: String?
    let goldenSkip: Bool?
}

struct PartyData: Codable {
    let code: String
    let name: String
    let createdAt: Double
    let queue: [PartySong]
    let nowPlaying: PartySong?
    let marquee: String?
    let endedAt: Double?
}

@MainActor
class PartyState: ObservableObject {
    @Published var name = ""
    @Published var nowPlaying: PartySong?
    @Published var queue: [PartySong] = []
    @Published var marquee: String?
    @Published var endedAt: Double?

    private var sseTask: Task<Void, Never>?
    private var pollTimer: Timer?
    private var baseURL = ""
    private var code = ""

    func connect(baseURL: String, code: String) {
        self.baseURL = baseURL
        self.code = code.uppercased()
        fetchOnce()
        startSSE()
        startPolling()
    }

    func disconnect() {
        sseTask?.cancel()
        sseTask = nil
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func apply(_ data: PartyData) {
        name = data.name
        nowPlaying = data.nowPlaying
        queue = data.queue
        marquee = data.marquee
        endedAt = data.endedAt
    }

    private func fetchOnce() {
        Task {
            guard let url = URL(string: "\(baseURL)/api/party/\(code)") else { return }
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
                let party = try JSONDecoder().decode(PartyData.self, from: data)
                apply(party)
            } catch { }
        }
    }

    private func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in self.fetchOnce() }
        }
    }

    private func startSSE() {
        sseTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.runSSE()
                if !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 2_000_000_000)
                }
            }
        }
    }

    private func runSSE() async {
        guard let url = URL(string: "\(baseURL)/api/party/\(code)/stream") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 120

        do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }

            for try await line in bytes.lines {
                if Task.isCancelled { break }
                guard line.hasPrefix("data: ") else { continue }
                let json = String(line.dropFirst(6))
                guard let data = json.data(using: .utf8) else { continue }
                if let party = try? JSONDecoder().decode(PartyData.self, from: data) {
                    await MainActor.run { self.apply(party) }
                }
            }
        } catch {
            // Connection dropped — the outer loop will retry
        }
    }
}
