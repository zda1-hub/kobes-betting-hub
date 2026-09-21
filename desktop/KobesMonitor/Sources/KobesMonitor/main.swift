import AppKit
import Carbon
import WebKit

private let dashboardURL = URL(string: "https://kobesbettinghub.com/admin/analytics?app=mac&v=3")!
private let hotKeySignature: OSType = 0x4B42484D // KBHM
private let hotKeyID: UInt32 = 1

final class DashboardController: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    private let statusLabel = NSTextField(labelWithString: "Secure admin dashboard")

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.allowsMagnification = true
        webView.setValue(false, forKey: "drawsBackground")
    }

    func makeView() -> NSView {
        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor(calibratedWhite: 0.965, alpha: 1).cgColor

        let top = NSVisualEffectView()
        top.material = .headerView
        top.blendingMode = .withinWindow
        top.state = .active

        let icon = NSImageView(image: NSImage(systemSymbolName: "chart.line.uptrend.xyaxis.circle.fill", accessibilityDescription: "Kobe's Monitor")!)
        icon.contentTintColor = NSColor.systemYellow
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 24, weight: .semibold)

        let title = NSTextField(labelWithString: "Kobe’s Betting Hub")
        title.font = .systemFont(ofSize: 17, weight: .bold)
        let subtitle = NSTextField(labelWithString: "LIVE BUSINESS MONITOR")
        subtitle.font = .systemFont(ofSize: 10, weight: .bold)
        subtitle.textColor = .secondaryLabelColor

        statusLabel.font = .systemFont(ofSize: 11, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor

        let refresh = NSButton(title: "Refresh", target: self, action: #selector(refreshDashboard))
        refresh.bezelStyle = .rounded
        refresh.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: nil)
        let browser = NSButton(title: "Open in Browser", target: self, action: #selector(openInBrowser))
        browser.bezelStyle = .rounded
        browser.image = NSImage(systemSymbolName: "safari", accessibilityDescription: nil)

        [top, webView, icon, title, subtitle, statusLabel, refresh, browser].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
        }
        root.addSubview(top)
        root.addSubview(webView)
        [icon, title, subtitle, statusLabel, refresh, browser].forEach(top.addSubview)

        NSLayoutConstraint.activate([
            top.leadingAnchor.constraint(equalTo: root.leadingAnchor), top.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            top.topAnchor.constraint(equalTo: root.topAnchor), top.heightAnchor.constraint(equalToConstant: 68),
            webView.leadingAnchor.constraint(equalTo: root.leadingAnchor), webView.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            webView.topAnchor.constraint(equalTo: top.bottomAnchor), webView.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            icon.leadingAnchor.constraint(equalTo: top.leadingAnchor, constant: 18), icon.centerYAnchor.constraint(equalTo: top.centerYAnchor), icon.widthAnchor.constraint(equalToConstant: 32), icon.heightAnchor.constraint(equalToConstant: 32),
            title.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: 10), title.topAnchor.constraint(equalTo: top.topAnchor, constant: 13),
            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor), subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 1),
            statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: subtitle.trailingAnchor, constant: 20), statusLabel.centerYAnchor.constraint(equalTo: top.centerYAnchor),
            browser.trailingAnchor.constraint(equalTo: top.trailingAnchor, constant: -16), browser.centerYAnchor.constraint(equalTo: top.centerYAnchor),
            refresh.trailingAnchor.constraint(equalTo: browser.leadingAnchor, constant: -8), refresh.centerYAnchor.constraint(equalTo: top.centerYAnchor),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: refresh.leadingAnchor, constant: -14)
        ])
        webView.load(URLRequest(url: dashboardURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 30))
        return root
    }

    @objc func refreshDashboard() {
        statusLabel.stringValue = "Refreshing live data…"
        webView.reload()
    }

    @objc func openInBrowser() { NSWorkspace.shared.open(dashboardURL) }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        statusLabel.stringValue = "Loading securely…"
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        statusLabel.stringValue = webView.url?.host?.contains("kobesbettinghub.com") == true ? "Live • updated now" : "Secure sign-in"
        if webView.url?.path.contains("admin/analytics") == true {
            webView.evaluateJavaScript("window.scrollTo({top: 0, behavior: 'instant'})")
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        statusLabel.stringValue = "Couldn’t refresh • check connection"
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var statusItem: NSStatusItem!
    private var window: NSWindow!
    private var dashboard: DashboardController!
    private var eventHandler: EventHandlerRef?
    private var hotKeyRef: EventHotKeyRef?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusItem()
        configureWindow()
        registerGlobalHotKey()
    }

    private func configureStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: "chart.line.uptrend.xyaxis.circle.fill", accessibilityDescription: "Kobe's Monitor")
        button.image?.isTemplate = false
        button.contentTintColor = .systemYellow
        button.title = " KBH"
        button.toolTip = "Kobe’s Monitor • Control–Option–K"
        button.target = self
        button.action = #selector(toggleWindow)
    }

    private func configureWindow() {
        dashboard = DashboardController()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "Kobe’s Monitor"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 820, height: 600)
        window.contentView = dashboard.makeView()
        window.delegate = self
        window.center()
    }

    @objc private func toggleWindow() {
        if window.isVisible && NSApp.isActive {
            window.orderOut(nil)
        } else {
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func registerGlobalHotKey() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, event, userData in
            var identifier = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier)
            if identifier.signature == hotKeySignature && identifier.id == hotKeyID, let userData {
                Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue().toggleWindow()
            }
            return noErr
        }
        InstallEventHandler(GetApplicationEventTarget(), callback, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &eventHandler)
        let modifiers = UInt32(controlKey | optionKey)
        RegisterEventHotKey(UInt32(kVK_ANSI_K), modifiers, EventHotKeyID(signature: hotKeySignature, id: hotKeyID), GetApplicationEventTarget(), 0, &hotKeyRef)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { toggleWindow() }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let eventHandler { RemoveEventHandler(eventHandler) }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
