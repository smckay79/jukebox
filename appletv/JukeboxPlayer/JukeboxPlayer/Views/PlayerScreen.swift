import SwiftUI

struct PlayerScreen: View {
    let code: String
    let baseURL: String
    let adminKey: String?
    let onExit: () -> Void

    @StateObject private var party = PartyState()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let endedAt = party.endedAt, endedAt > 0 {
                // Party ended card
                VStack(spacing: 8) {
                    Text("Party ended")
                        .font(.caption)
                        .textCase(.uppercase)
                        .tracking(3)
                        .foregroundColor(.white.opacity(0.5))
                    Text(party.name)
                        .font(.title)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                }
            } else {
                VStack(spacing: 0) {
                    // Up-next strip
                    upNextStrip
                        .frame(height: 56)

                    // Now playing area
                    nowPlayingArea
                        .frame(maxHeight: .infinity)

                    // Marquee
                    if let marquee = party.marquee, !marquee.isEmpty {
                        MarqueeText(text: marquee)
                            .frame(height: 36)
                    }
                }
            }

            // Admin skip button
            if adminKey != nil {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Button(action: {
                            guard let adminKey else { return }
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
                        .padding(.trailing, 24)
                        .padding(.bottom, 16)
                    }
                }
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            party.connect(baseURL: baseURL, code: code)
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            party.disconnect()
        }
        .onExitCommand { onExit() }
    }

    private var upNextStrip: some View {
        HStack(spacing: 12) {
            if let next = party.queue.first {
                Text("Up next")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .textCase(.uppercase)
                    .tracking(1)
                    .foregroundColor(.white.opacity(0.6))
                AsyncImage(url: URL(string: next.thumbnail)) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    Color.white.opacity(0.1)
                }
                .frame(width: 64, height: 36)
                .cornerRadius(4)
                .clipped()
                Text(next.title)
                    .font(.callout)
                    .foregroundColor(.white)
                    .lineLimit(1)
                Spacer()
                Text("Added by \(next.addedBy)")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.5))
            } else {
                Text("Queue is empty — scan the QR to add a song.")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.4))
                Spacer()
            }
        }
        .padding(.horizontal, 24)
        .background(Color.black.opacity(0.8))
    }

    private var nowPlayingArea: some View {
        Group {
            if let song = party.nowPlaying {
                ZStack {
                    // Background thumbnail (blurred)
                    AsyncImage(url: URL(string: song.thumbnail)) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Color.black
                    }
                    .blur(radius: 40)
                    .opacity(0.4)
                    .clipped()

                    // Song info
                    VStack(spacing: 20) {
                        Spacer()

                        // Thumbnail
                        AsyncImage(url: URL(string: song.thumbnail)) { image in
                            image.resizable().aspectRatio(contentMode: .fit)
                        } placeholder: {
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color.white.opacity(0.1))
                        }
                        .frame(maxWidth: 640, maxHeight: 360)
                        .cornerRadius(12)
                        .shadow(radius: 20)

                        // Title + added by
                        VStack(spacing: 6) {
                            Text(song.title)
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.white)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                            Text("Added by \(song.addedBy)")
                                .font(.callout)
                                .foregroundColor(.white.opacity(0.6))
                        }

                        // Downvote indicators
                        if song.goldenSkip == true {
                            Text("GOLDEN DOWNVOTE")
                                .font(.title3)
                                .fontWeight(.black)
                                .tracking(3)
                                .foregroundColor(Color.yellow)
                                .shadow(color: .yellow.opacity(0.6), radius: 20)
                        } else if let downvotes = song.downvotes, !downvotes.isEmpty {
                            HStack(spacing: 8) {
                                ForEach(0..<min(downvotes.count, 3), id: \.self) { _ in
                                    Text("X")
                                        .font(.title)
                                        .fontWeight(.black)
                                        .foregroundColor(.red)
                                        .frame(width: 40, height: 40)
                                        .background(Color.red.opacity(0.2))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color.red, lineWidth: 2)
                                        )
                                }
                            }
                        }

                        Spacer()
                    }
                    .padding(.horizontal, 40)

                    // QR code bottom-right
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            QRCodeView(code: code)
                                .frame(width: 120, height: 120)
                                .padding(16)
                        }
                    }
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "music.note")
                        .font(.system(size: 48))
                        .foregroundColor(.white.opacity(0.3))
                    Text("Waiting for the first banger…")
                        .font(.headline)
                        .foregroundColor(.white.opacity(0.4))

                    QRCodeView(code: code)
                        .frame(width: 160, height: 160)
                        .padding(.top, 20)

                    Text("Scan to add a song")
                        .font(.callout)
                        .foregroundColor(.white.opacity(0.5))
                }
            }
        }
    }
}

// QR code using CoreImage
struct QRCodeView: View {
    let code: String

    var body: some View {
        if let image = generateQR() {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .cornerRadius(8)
        }
    }

    private func generateQR() -> UIImage? {
        let urlString = "\(Configuration.baseURL)/party/\(code)"
        guard let data = urlString.data(using: .ascii),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scale = 256.0 / output.extent.width
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        return UIImage(ciImage: scaled)
    }
}

// Simple scrolling marquee
struct MarqueeText: View {
    let text: String
    @State private var offset: CGFloat = 0
    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let shouldScroll = textWidth > geo.size.width
            HStack(spacing: 0) {
                if shouldScroll {
                    Text(text + "     •     " + text + "     •     ")
                        .font(.callout)
                        .foregroundColor(.white.opacity(0.7))
                        .fixedSize()
                        .offset(x: offset)
                } else {
                    Spacer()
                    Text(text)
                        .font(.callout)
                        .foregroundColor(.white.opacity(0.7))
                    Spacer()
                }
            }
            .frame(height: geo.size.height)
            .clipped()
            .onAppear {
                containerWidth = geo.size.width
                let measureText = text + "     •     "
                let size = (measureText as NSString).size(
                    withAttributes: [.font: UIFont.systemFont(ofSize: 17)]
                )
                textWidth = size.width
                if textWidth > geo.size.width {
                    startScrolling()
                }
            }
        }
        .background(Color.black.opacity(0.6))
    }

    private func startScrolling() {
        offset = 0
        let measureText = text + "     •     "
        let size = (measureText as NSString).size(
            withAttributes: [.font: UIFont.systemFont(ofSize: 17)]
        )
        let scrollWidth = size.width
        let duration = Double(scrollWidth) / 40.0
        withAnimation(.linear(duration: duration).repeatForever(autoreverses: false)) {
            offset = -scrollWidth
        }
    }
}
