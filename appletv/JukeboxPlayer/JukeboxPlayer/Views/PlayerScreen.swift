import SwiftUI
import AVKit

struct PlayerScreen: View {
    let code: String
    let baseURL: String
    let adminKey: String?
    let onExit: () -> Void

    @StateObject private var party = PartyState()
    @StateObject private var videoPlayer = VideoPlayerState()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let endedAt = party.endedAt, endedAt > 0 {
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
                    upNextStrip
                        .frame(height: 56)
                        .zIndex(10)

                    nowPlayingArea
                        .frame(maxHeight: .infinity)

                    bottomBar
                        .zIndex(10)
                }
            }

            // QR code + label — bottom-right
            if party.nowPlaying != nil || party.endedAt == nil {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        HStack(spacing: 12) {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("Join")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.white.opacity(0.8))
                                Text(code)
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .foregroundColor(Color("BrandPrimary"))
                            }
                            QRCodeView(code: code)
                                .frame(width: 100, height: 100)
                        }
                        .padding(10)
                        .background(Color.black.opacity(0.6))
                        .cornerRadius(12)
                        .padding(.trailing, 20)
                        .padding(.bottom, 16)
                    }
                }
                .zIndex(15)
            }

            // Admin skip — bottom-left, small
            if adminKey != nil {
                VStack {
                    Spacer()
                    HStack {
                        Button(action: {
                            guard let adminKey else { return }
                            Task { await APIClient.skipSong(baseURL: baseURL, code: code, adminKey: adminKey) }
                        }) {
                            Text("Skip")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.5))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 4)
                                .background(Color.white.opacity(0.08))
                                .cornerRadius(6)
                        }
                        .buttonStyle(.plain)
                        .padding(.leading, 20)
                        .padding(.bottom, 16)
                        Spacer()
                    }
                }
                .zIndex(20)
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            party.connect(baseURL: baseURL, code: code)
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            party.disconnect()
            videoPlayer.stop()
        }
        .onReceive(party.$nowPlaying) { song in
            handleVideoChange(videoId: song?.videoId)
        }
        .onExitCommand { onExit() }
    }

    private func handleVideoChange(videoId: String?) {
        if let videoId {
            videoPlayer.loadVideo(videoId: videoId)
        } else {
            videoPlayer.stop()
        }
    }

    private var bottomBar: some View {
        Group {
            if let marquee = party.marquee, !marquee.isEmpty {
                MarqueeText(text: marquee)
                    .frame(height: 36)
                    .background(Color.black.opacity(0.6))
            }
        }
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
                    if videoPlayer.isPlaying, let player = videoPlayer.player {
                        AVPlayerLayerView(player: player)
                    } else {
                        AsyncImage(url: URL(string: song.thumbnail)) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.black
                        }
                        .blur(radius: 40)
                        .opacity(0.4)
                        .clipped()
                    }

                    if !videoPlayer.isPlaying {
                        VStack(spacing: 20) {
                            Spacer()

                            AsyncImage(url: URL(string: song.thumbnail)) { image in
                                image.resizable().aspectRatio(contentMode: .fit)
                            } placeholder: {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color.white.opacity(0.1))
                            }
                            .frame(maxWidth: 640, maxHeight: 360)
                            .cornerRadius(12)
                            .shadow(radius: 20)

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

                            if videoPlayer.isLoading {
                                VStack(spacing: 8) {
                                    ProgressView()
                                        .tint(.white)
                                    Text("Loading video…")
                                        .font(.caption2)
                                        .foregroundColor(.white.opacity(0.4))
                                }
                            } else if let error = videoPlayer.errorMessage {
                                Text(error)
                                    .font(.caption2)
                                    .foregroundColor(.red.opacity(0.7))
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 40)
                            }

                            Spacer()
                        }
                        .padding(.horizontal, 40)
                    }

                    if videoPlayer.isPlaying {
                        VStack {
                            Spacer()
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(song.title)
                                        .font(.callout)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.white)
                                    Text("Added by \(song.addedBy)")
                                        .font(.caption2)
                                        .foregroundColor(.white.opacity(0.6))
                                }
                                .padding(12)
                                .background(.ultraThinMaterial)
                                .cornerRadius(10)
                                Spacer()
                            }
                            .padding(.leading, 24)
                            .padding(.bottom, 16)
                        }
                    }

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

struct AVPlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> UIView {
        let view = PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspect
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        if let view = uiView as? PlayerUIView {
            view.playerLayer.player = player
        }
    }

    private class PlayerUIView: UIView {
        var playerLayer: AVPlayerLayer {
            layer as! AVPlayerLayer
        }
        override class var layerClass: AnyClass {
            AVPlayerLayer.self
        }
    }
}

@MainActor
class VideoPlayerState: ObservableObject {
    @Published var player: AVPlayer?
    @Published var isPlaying = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var currentVideoId: String?
    private var loadTask: Task<Void, Never>?
    private var statusObserver: NSKeyValueObservation?
    private var errorObserver: NSKeyValueObservation?

    func loadVideo(videoId: String) {
        guard videoId != currentVideoId else { return }
        currentVideoId = videoId
        cleanupPlayer()
        isLoading = true
        errorMessage = nil

        loadTask = Task {
            let result = await APIClient.fetchVideoURL(videoId: videoId)
            guard !Task.isCancelled, currentVideoId == videoId else { return }

            guard let result else {
                isLoading = false
                errorMessage = "Could not load video stream"
                return
            }

            guard let url = URL(string: result.url) else {
                isLoading = false
                errorMessage = "Invalid stream URL"
                return
            }

            print("[Video] Playing \(result.type) from: \(url.absoluteString.prefix(100))")
            let item = AVPlayerItem(url: url)
            let avPlayer = AVPlayer(playerItem: item)

            statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                Task { @MainActor in
                    guard let self, self.currentVideoId == videoId else { return }
                    switch item.status {
                    case .readyToPlay:
                        print("[Video] Ready to play")
                        self.isPlaying = true
                        self.isLoading = false
                        self.errorMessage = nil
                    case .failed:
                        let err = item.error?.localizedDescription ?? "Unknown playback error"
                        print("[Video] Failed: \(err)")
                        self.isPlaying = false
                        self.isLoading = false
                        self.errorMessage = err
                    default:
                        break
                    }
                }
            }

            player = avPlayer
            isLoading = true
            avPlayer.play()
        }
    }

    func stop() {
        loadTask?.cancel()
        loadTask = nil
        cleanupPlayer()
        errorMessage = nil
        currentVideoId = nil
    }

    private func cleanupPlayer() {
        statusObserver?.invalidate()
        statusObserver = nil
        errorObserver?.invalidate()
        errorObserver = nil
        player?.pause()
        player = nil
        isPlaying = false
        isLoading = false
    }
}

struct QRCodeView: View {
    let code: String

    var body: some View {
        if let image = generateQR() {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .cornerRadius(8)
        } else {
            VStack(spacing: 4) {
                Image(systemName: "qrcode")
                    .font(.system(size: 40))
                    .foregroundColor(.white)
                Text("Scan to join")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.7))
                Text(code)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(Color("BrandPrimary"))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white.opacity(0.1))
            .cornerRadius(8)
        }
    }

    private func generateQR() -> UIImage? {
        let urlString = "\(Configuration.baseURL)/party/\(code)"
        guard let data = urlString.data(using: .ascii),
              let filter = CIFilter(name: "CIQRCodeGenerator") else {
            print("[QR] CIFilter not available")
            return nil
        }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else {
            print("[QR] No output image")
            return nil
        }
        let scale = 256.0 / output.extent.width
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else {
            print("[QR] Failed to create CGImage")
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}

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
