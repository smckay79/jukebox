import SwiftUI

struct CodeEntryScreen: View {
    let onSubmit: (String, String?) -> Void
    let onRejoin: (RecentParty) -> Void
    let recentParties: [RecentParty]

    @State private var code = ""
    @State private var pin = ""
    @FocusState private var focusedField: Field?

    private enum Field: Hashable {
        case code, pin, connect
    }

    private var isValid: Bool { code.count == 6 }

    var body: some View {
        ZStack {
            Color("Background").ignoresSafeArea()

            VStack(spacing: 40) {
                // Header
                VStack(spacing: 8) {
                    Image(systemName: "music.note.tv")
                        .font(.system(size: 60))
                        .foregroundColor(Color("BrandPrimary"))
                    Text("Jukebox Player")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    Text("Enter your party code")
                        .font(.headline)
                        .foregroundColor(.white.opacity(0.6))
                }

                // Input fields
                VStack(spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Party Code")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.5))
                        TextField("XXXXXX", text: $code)
                            .textFieldStyle(.plain)
                            .font(.system(size: 38, weight: .bold, design: .monospaced))
                            .multilineTextAlignment(.center)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.characters)
                            .focused($focusedField, equals: .code)
                            .onChange(of: code) { newValue in
                                let filtered = newValue
                                    .uppercased()
                                    .filter { $0.isLetter || $0.isNumber }
                                if filtered.count <= 6 {
                                    code = filtered
                                } else {
                                    code = String(filtered.prefix(6))
                                }
                            }
                            .padding()
                            .background(Color.white.opacity(0.08))
                            .cornerRadius(12)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Host PIN (optional)")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.5))
                        TextField("0000", text: $pin)
                            .textFieldStyle(.plain)
                            .font(.system(size: 32, weight: .semibold, design: .monospaced))
                            .multilineTextAlignment(.center)
                            .keyboardType(.numberPad)
                            .focused($focusedField, equals: .pin)
                            .onChange(of: pin) { newValue in
                                let filtered = newValue.filter { $0.isNumber }
                                pin = String(filtered.prefix(4))
                            }
                            .padding()
                            .background(Color.white.opacity(0.08))
                            .cornerRadius(12)
                        Text("Enter the host PIN to enable skip controls")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.35))
                    }

                    // Connect button
                    Button(action: {
                        onSubmit(code, pin.isEmpty ? nil : pin)
                    }) {
                        Text("Connect")
                            .font(.headline)
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color("BrandPrimary"))
                    .disabled(!isValid)
                    .focused($focusedField, equals: .connect)
                }
                .frame(maxWidth: 500)

                // Recent parties
                if !recentParties.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recent Parties")
                            .font(.headline)
                            .foregroundColor(.white.opacity(0.5))

                        ForEach(recentParties) { party in
                            Button(action: { onRejoin(party) }) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 8) {
                                            Text(party.name)
                                                .font(.body)
                                                .fontWeight(.medium)
                                                .foregroundColor(.white)
                                            Text(party.code)
                                                .font(.caption)
                                                .fontWeight(.bold)
                                                .foregroundColor(Color("BrandPrimary"))
                                            if party.adminKey != nil {
                                                Text("Admin")
                                                    .font(.caption2)
                                                    .fontWeight(.semibold)
                                                    .foregroundColor(.yellow)
                                                    .padding(.horizontal, 6)
                                                    .padding(.vertical, 2)
                                                    .background(Color.yellow.opacity(0.2))
                                                    .cornerRadius(4)
                                            }
                                        }
                                        Text(party.joinedAt.timeAgo)
                                            .font(.caption)
                                            .foregroundColor(.white.opacity(0.4))
                                    }
                                    Spacer()
                                    Text("Rejoin")
                                        .font(.caption)
                                        .foregroundColor(Color("BrandPrimary"))
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Color.white.opacity(0.06))
                                .cornerRadius(10)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .frame(maxWidth: 500)
                }

                Spacer()
            }
            .padding(.top, 60)
        }
        .onAppear { focusedField = .code }
    }
}

extension Date {
    var timeAgo: String {
        let diff = Date().timeIntervalSince(self)
        let mins = Int(diff / 60)
        if mins < 1 { return "just now" }
        if mins < 60 { return "\(mins)m ago" }
        let hours = mins / 60
        if hours < 24 { return "\(hours)h ago" }
        let days = hours / 24
        return "\(days)d ago"
    }
}
