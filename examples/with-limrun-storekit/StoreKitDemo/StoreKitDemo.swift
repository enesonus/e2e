import StoreKit
import SwiftUI

@MainActor
final class Store: ObservableObject {
    @Published var products: [Product] = []
    @Published var catalog = "Loading products"
    @Published var result = "No purchase"
    @Published var premium = "Premium locked"
    @Published var subscription = "Subscription inactive"
    private var updates: Task<Void, Never>?
    private let identifiers = ["dev.e2e.storekit.coins", "dev.e2e.storekit.premium", "dev.e2e.storekit.monthly"]

    init() {
        updates = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update {
                    await transaction.finish()
                    await self?.refreshEntitlements()
                }
            }
        }
    }

    deinit { updates?.cancel() }

    func load() async {
        catalog = "Loading products"
        do {
            products = try await Product.products(for: identifiers).sorted { $0.id < $1.id }
            catalog = "Products loaded: \(products.count)"
        } catch {
            catalog = "Product error: \(error.localizedDescription)"
        }
        await refreshEntitlements()
    }

    func buy(_ product: Product) async {
        result = "Purchase pending"
        do {
            switch try await product.purchase() {
            case .success(.verified(let transaction)):
                await transaction.finish()
                result = "Purchased \(product.displayName)"
                await refreshEntitlements()
            case .success(.unverified(_, let error)):
                result = "Unverified: \(error.localizedDescription)"
            case .userCancelled: result = "Purchase cancelled"
            case .pending: result = "Purchase pending"
            @unknown default: result = "Unknown purchase result"
            }
        } catch { result = "Purchase error: \(error.localizedDescription)" }
    }

    func refreshEntitlements() async {
        var owned = Set<String>()
        for await update in Transaction.currentEntitlements {
            if case .verified(let transaction) = update,
               transaction.revocationDate == nil,
               transaction.expirationDate.map({ $0 > Date() }) ?? true {
                owned.insert(transaction.productID)
            }
        }
        premium = owned.contains("dev.e2e.storekit.premium") ? "Premium unlocked" : "Premium locked"
        subscription = owned.contains("dev.e2e.storekit.monthly") ? "Subscription active" : "Subscription inactive"
    }
}

@main
struct StoreKitDemoApp: App {
    @StateObject private var store = Store()
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 20) {
                Text("StoreKit Demo").font(.largeTitle)
                Text(store.catalog)
                ForEach(store.products) { product in
                    Button("Buy \(product.displayName)") { Task { await store.buy(product) } }
                    Text("\(product.displayName): \(product.displayPrice)")
                }
                Text(store.result)
                Text(store.premium)
                Text(store.subscription)
                Button("Reload products") { Task { await store.load() } }
            }
            .padding()
            .task { await store.load() }
        }
    }
}
