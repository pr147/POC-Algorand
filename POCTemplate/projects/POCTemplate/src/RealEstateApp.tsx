import React, { useState, useEffect } from 'react';
import { Wallet, Shield, Users, TrendingUp, Home, CheckCircle, AlertCircle } from 'lucide-react';
import { useWallet } from '@txnlab/use-wallet-react'
import ConnectWallet from './components/ConnectWallet'
import PropertyListing from './components/PropertyListing'



// Mock services - replace with actual imports
const mockWalletService = {
  connectPeraWallet: async () => [{ address: 'MOCK123...', name: 'Mock Wallet' }],
  connectAlgoSigner: async () => [{ address: 'MOCK456...', name: 'Mock AlgoSigner' }],
  getBalance: async () => 1000000000, // 1000 ALGO
  disconnect: async () => {},
  formatAlgoAmount: (amount: number) => (amount / 1000000).toFixed(2),
  formatAddress: (addr: string) => `${addr.slice(0, 8)}...${addr.slice(-4)}`
};

const mockRealEstateContract = {
  deployContract: async () => Math.floor(Math.random() * 100000),
  makeOffer: async () => 'mock_tx_123',
  confirmTransfer: async () => 'mock_tx_456',
  cancelDeal: async () => 'mock_tx_789'
};

interface Property {
  id: number;
  title: string;
  location: string;
  price: number;
  sqft: number;
  bedrooms: number;
  bathrooms: number;
  description: string;
  images: string[];
  seller: string;
  documentHash: string;
  contractAddress?: number;
  status: 'listed' | 'pending' | 'sold';
  listingDate: string;
}

const RealEstateApp: React.FC = () => {
  const [openWalletModal, setOpenWalletModal] = useState(false);
  const [cancelledProperties, setCancelledProperties] = useState<number[]>([]);

  
  const [openPaymentModal, setOpenPaymentModal] = useState(false);
  const { activeAddress, transactionSigner } = useWallet();
  const toggleWalletModal = () => setOpenWalletModal(!openWalletModal);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<Array<{id: number, type: 'success' | 'error', message: string}>>([]);
  const [activeTab, setActiveTab] = useState<'marketplace' | 'analytics' | 'about'>('marketplace');

  
  
  // Mock data for initial properties
  useEffect(() => {
    const mockProperties: Property[] = [
      {
        id: 1,
        title: "Modern Downtown Condo",
        location: "Seattle, WA",
        price: 750000000000, // 750,000 ALGO
        sqft: 1200,
        bedrooms: 2,
        bathrooms: 2,
        description: "Beautiful modern condo in the heart of downtown Seattle with stunning city views.",
        images: [],
        seller: "SELLER123456789ABCDEFGHIJKLMNOP",
        documentHash: "hash_abc123",
        contractAddress: 12345,
        status: 'listed',
        listingDate: new Date().toISOString()
      },
      {
        id: 2,
        title: "Suburban Family Home",
        location: "Austin, TX",
        price: 425000000000, // 425,000 ALGO
        sqft: 2400,
        bedrooms: 4,
        bathrooms: 3,
        description: "Spacious family home in quiet neighborhood with large backyard and great schools nearby.",
        images: [],
        seller: "SELLER987654321ZYXWVUTSRQPONMLK",
        documentHash: "hash_def456",
        contractAddress: 12346,
        status: 'pending',
        listingDate: new Date(Date.now() - 86400000).toISOString()
      }
    ];
    setProperties(mockProperties);
  }, []);

  const addNotification = (type: 'success' | 'error', message: string) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleCreateListing = async (property: Property) => {
    setIsLoading(true);
    try {
      // Deploy smart contract
      const contractAddress = await mockRealEstateContract.deployContract();
      
      const newProperty = {
        ...property,
        id: Date.now(),
        contractAddress,
        seller: activeAddress
      };
      
      setProperties(prev => [...prev, newProperty]);
      addNotification('success', `Property listed successfully! Contract: #${contractAddress}`);
    } catch (error: any) {
      addNotification('error', `Failed to create listing: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMakeOffer = async (propertyId: number, amount: number) => {
    setIsLoading(true);
    try {
      const txId = await mockRealEstateContract.makeOffer();
      
      setProperties(prev => 
        prev.map(p => p.id === propertyId ? { ...p, status: 'pending' as const } : p)
      );
      
      addNotification('success', `Offer submitted! Transaction: ${txId}`);
    } catch (error: any) {
      addNotification('error', `Failed to make offer: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTransfer = async (propertyId: number) => {
    setIsLoading(true);
    try {
      const txId = await mockRealEstateContract.confirmTransfer();
      
      setProperties(prev => 
        prev.map(p => p.id === propertyId ? { ...p, status: 'sold' as const } : p)
      );
      
      addNotification('success', `Transfer confirmed! Funds released. Transaction: ${txId}`);
    } catch (error: any) {
      addNotification('error', `Failed to confirm transfer: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDeal = async (propertyId: number) => {
  setIsLoading(true);
  try {
    const txId = await mockRealEstateContract.cancelDeal();

    const property = properties.find(p => p.id === propertyId);
    if (!property) throw new Error('Property not found');

    if (property.seller === activeAddress) {
      // Seller cancels → remove property after showing highlight
      setCancelledProperties(prev => [...prev, propertyId]);
      addNotification('success', `Deal cancelled by seller! Transaction: ${txId}`);

      setTimeout(() => {
        setProperties(prev => prev.filter(p => p.id !== propertyId));
        setCancelledProperties(prev => prev.filter(id => id !== propertyId));
      }, 2000);
    } else {
      // Buyer cancels → keep property listed
      setProperties(prev =>
        prev.map(p =>
          p.id === propertyId ? { ...p, status: 'listed' as const } : p
        )
      );
      addNotification('success', `Deal cancelled by buyer. Property remains listed. Transaction: ${txId}`);
    }

  } catch (error: any) {
    addNotification('error', `Failed to cancel deal: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};



  const MarketplaceTab = () => (
  <PropertyListing
    walletConnected={!!activeAddress}  // <-- update here
    userAddress={activeAddress || ''}  // <-- update here
    onCreateListing={handleCreateListing}
    onMakeOffer={handleMakeOffer}
    onConfirmTransfer={handleConfirmTransfer}
    onCancelDeal={handleCancelDeal}
    properties={properties}
    cancelledProperties={cancelledProperties}
    isLoading={isLoading}
  />
);


  const AnalyticsTab = () => (
    <div className="max-w-4xl mx-auto p-6">
      <h3 className="text-2xl font-bold mb-6 flex items-center">
        <TrendingUp className="w-8 h-8 mr-3 text-green-600" />
        Market Analytics
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 p-6 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-2">Total Volume</h4>
          <p className="text-3xl font-bold text-blue-600">1,175,000 ALGO</p>
          <p className="text-sm text-blue-500">+12% this month</p>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 p-6 rounded-lg border border-green-200">
          <h4 className="font-semibold text-green-800 mb-2">Properties Sold</h4>
          <p className="text-3xl font-bold text-green-600">23</p>
          <p className="text-sm text-green-500">+8% this month</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-violet-100 p-6 rounded-lg border border-purple-200">
          <h4 className="font-semibold text-purple-800 mb-2">Avg Price</h4>
          <p className="text-3xl font-bold text-purple-600">511,000 ALGO</p>
          <p className="text-sm text-purple-500">+5% this month</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="text-lg font-semibold mb-4">Recent Transaction Activity</h4>
        <div className="space-y-4">
          {[
            { property: "Downtown Condo", price: "750K ALGO", status: "Sold", time: "2 hours ago" },
            { property: "Suburban Home", price: "425K ALGO", status: "Pending", time: "5 hours ago" },
            { property: "City Apartment", price: "320K ALGO", status: "Listed", time: "1 day ago" },
          ].map((tx, index) => (
            <div key={index} className="flex justify-between items-center py-3 border-b border-gray-100">
              <div>
                <p className="font-medium">{tx.property}</p>
                <p className="text-sm text-gray-500">{tx.time}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{tx.price}</p>
                <span className={`px-2 py-1 rounded text-xs ${
                  tx.status === 'Sold' ? 'bg-green-100 text-green-800' :
                  tx.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {tx.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const AboutTab = () => (
    <div className="max-w-4xl mx-auto p-6">
      <h3 className="text-2xl font-bold mb-6">About Our Platform</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-lg border border-blue-200">
          <Shield className="w-12 h-12 text-blue-600 mb-4" />
          <h4 className="text-lg font-semibold mb-3 text-blue-800">Trustless Security</h4>
          <p className="text-gray-700">
            Smart contracts on Algorand ensure funds are only released when conditions are met. 
            No middlemen, no fraud, complete transparency.
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200">
          <Users className="w-12 h-12 text-green-600 mb-4" />
          <h4 className="text-lg font-semibold mb-3 text-green-800">Direct Trading</h4>
          <p className="text-gray-700">
            Connect buyers and sellers directly. Eliminate agent commissions and reduce 
            transaction costs by up to 6%.
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-6 rounded-lg border border-purple-200">
          <TrendingUp className="w-12 h-12 text-purple-600 mb-4" />
          <h4 className="text-lg font-semibold mb-3 text-purple-800">AI Analytics</h4>
          <p className="text-gray-700">
            Advanced pricing algorithms analyze market data, comparable sales, and trends 
            to provide accurate property valuations.
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-red-50 p-6 rounded-lg border border-orange-200">
          <CheckCircle className="w-12 h-12 text-orange-600 mb-4" />
          <h4 className="text-lg font-semibold mb-3 text-orange-800">Verified Listings</h4>
          <p className="text-gray-700">
            Property documents are hashed and stored on-chain. Every listing includes 
            cryptographic proof of authenticity.
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
        <h4 className="text-lg font-semibold mb-4">How It Works</h4>
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div>
              <h5 className="font-semibold">List Your Property</h5>
              <p className="text-gray-600">Upload property details and documents. A smart contract is automatically deployed to handle the transaction.</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-4">
            <div className="bg-green-100 text-green-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h5 className="font-semibold">Buyer Makes Offer</h5>
              <p className="text-gray-600">Buyers deposit funds directly into the smart contract escrow. Funds are held securely until conditions are met.</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-4">
            <div className="bg-purple-100 text-purple-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div>
              <h5 className="font-semibold">Complete Transaction</h5>
              <p className="text-gray-600">Once ownership transfer is verified, seller confirms and funds are automatically released. If conditions aren't met, buyer gets refund.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-lg">
        <h4 className="text-xl font-bold mb-2">Ready to revolutionize real estate?</h4>
        <p className="mb-4">Join the future of property trading with blockchain technology.</p>
        <div className="flex space-x-4 text-sm">
          <span>✅ Zero fraud risk</span>
          <span>✅ Lower fees</span>
          <span>✅ Instant settlements</span>
          <span>✅ Global access</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg shadow-lg max-w-sm ${
              notification.type === 'success' 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500 text-white'
            }`}
          >
            <div className="flex items-center">
              {notification.type === 'success' ? (
                <CheckCircle className="w-5 h-5 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2" />
              )}
              <p className="text-sm">{notification.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Home className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">RealChain</h1>
                <p className="text-sm text-gray-600">Trustless Real Estate on Algorand</p>
              </div>
            </div>

          {/* Wallet Section */}
<div className="flex items-center space-x-4">
  <button
    onClick={toggleWalletModal}
    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-2"
  >
    {activeAddress ? 'Wallet Connected ✅' : 'Connect Wallet'}
    <Wallet className="w-4 h-4" />
  </button>
</div>

          </div>

          {/* Navigation Tabs */}
          <nav className="mt-6 flex space-x-8">
            {[
              { id: 'marketplace', label: 'Marketplace', icon: Home },
              { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              { id: 'about', label: 'About', icon: Shield }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        {/* Modals */}
        <ConnectWallet openModal={openWalletModal} closeModal={toggleWalletModal} />
      </header>

      {/* Main Content */}
      <main className="py-8">
        {activeTab === 'marketplace' && <MarketplaceTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'about' && <AboutTab />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-semibold text-gray-800 mb-4">Platform</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>How it works</li>
                <li>Security</li>
                <li>Fees</li>
                <li>Supported regions</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 mb-4">For Sellers</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>List property</li>
                <li>Pricing tools</li>
                <li>Documentation</li>
                <li>Support</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 mb-4">For Buyers</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>Browse listings</li>
                <li>Market analytics</li>
                <li>Financing</li>
                <li>Buyer guide</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800 mb-4">Technology</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>Algorand blockchain</li>
                <li>Smart contracts</li>
                <li>API documentation</li>
                <li>Developer tools</li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-gray-500">
            <p>&copy; 2025 RealChain. Powered by Algorand. Built for the future of real estate.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default RealEstateApp;