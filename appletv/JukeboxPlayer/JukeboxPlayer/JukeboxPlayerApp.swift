import SwiftUI

@main
struct VideoJamPlayerApp: App {
    @StateObject private var store = PartyCodeStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if let code = store.currentCode, !code.isEmpty {
                    PlayerScreen(
                        code: code,
                        baseURL: Configuration.baseURL,
                        adminKey: store.adminKey,
                        onExit: { store.clear() }
                    )
                } else {
                    CodeEntryScreen(
                        onSubmit: { code, pin in
                            Task {
                                store.setCode(code)
                                let name = await APIClient.fetchPartyName(
                                    baseURL: Configuration.baseURL, code: code
                                )
                                var key: String? = nil
                                if let pin = pin {
                                    key = await APIClient.verifyPin(
                                        baseURL: Configuration.baseURL, code: code, pin: pin
                                    )
                                    if let key { store.setAdminKey(key) }
                                }
                                store.addToHistory(code: code, name: name, adminKey: key)
                            }
                        },
                        onRejoin: { party in
                            store.setCode(party.code)
                            if let key = party.adminKey { store.setAdminKey(key) }
                        },
                        recentParties: store.history
                    )
                }
            }
            .preferredColorScheme(.dark)
        }
    }
}
