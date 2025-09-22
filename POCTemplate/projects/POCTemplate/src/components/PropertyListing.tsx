import React, { useState } from 'react';
import { Home, MapPin, DollarSign, Calendar, User, Shield, TrendingUp } from 'lucide-react';
import { Property } from '../types/Property';

// Mock data for pricing analytics
const mockPriceHistory = [
  { month: 'Jan', price: 450000 },
  { month: 'Feb', price: 465000 },
  { month: 'Mar', price: 475000 },
  { month: 'Apr', price: 480000 },
  { month: 'May', price: 490000 },
  { month: 'Jun', price: 500000 },
];

const mockComparableProperties = [
  { id: 1, price: 485000, sqft: 2100, location: '0.2 miles away' },
  { id: 2, price: 520000, sqft: 2400, location: '0.4 miles away' },
  { id: 3, price: 465000, sqft: 1950, location: '0.3 miles away' },
];

interface PropertyListingProps {
  walletConnected: boolean;
  userAddress: string;
  onCreateListing: (property: Property) => Promise<void>;
  onMakeOffer: (propertyId: number, amount: number) => Promise<void>;
  onConfirmTransfer: (propertyId: number) => Promise<void>;
  onCancelDeal: (propertyId: number) => Promise<void>;
  properties: Property[];
  isLoading: boolean;
  cancelledProperties?: number[]; // <-- add this
}

const PropertyListing: React.FC<PropertyListingProps> = ({
  walletConnected,
  userAddress,
  onCreateListing,
  onMakeOffer,
  onConfirmTransfer,
  onCancelDeal,
  properties,
  isLoading,
  cancelledProperties = [] // <-- default empty array
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [analyticsPropertyId, setAnalyticsPropertyId] = useState<number | null>(null);


  const [formData, setFormData] = useState({
    title: '',
    location: '',
    price: '',
    sqft: '',
    bedrooms: '',
    bathrooms: '',
    description: '',
    images: [] as string[]
  });

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const documentHash = `doc_hash_${Date.now()}`;
    
    const newProperty: Property = {
      title: formData.title,
      location: formData.location,
      price: parseInt(formData.price) * 1000000, // Convert to microALGOs
      sqft: parseInt(formData.sqft),
      bedrooms: parseInt(formData.bedrooms),
      bathrooms: parseInt(formData.bathrooms),
      description: formData.description,
      images: formData.images,
      seller: userAddress,
      documentHash,
      status: 'listed',
      listingDate: new Date().toISOString()
    };

    try {
      await onCreateListing(newProperty);
      setShowCreateForm(false);
      setFormData({
        title: '',
        location: '',
        price: '',
        sqft: '',
        bedrooms: '',
        bathrooms: '',
        description: '',
        images: []
      });
    } catch (error) {
      console.error('Error creating listing:', error);
      alert('Error creating listing. Please try again.');
    }
  };

  const handleMakeOffer = async (property: Property) => {
  if (!property.id) {
    alert('Invalid property');
    return;
  }

  try {
    const offerInMicroAlgos = property.price; // use property price directly
    await onMakeOffer(property.id, offerInMicroAlgos);
    setSelectedProperty(null);
  } catch (error) {
    console.error('Error making offer:', error);
    alert('Error making offer. Please try again.');
  }
};


  const formatPrice = (microAlgos: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(microAlgos / 1000000);
  };

  const PriceAnalytics = ({ property }: { property: Property }) => (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
      <h4 className="text-lg font-semibold mb-4 flex items-center">
        <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
        AI Price Analytics
      </h4>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border">
          <h5 className="font-semibold text-gray-700">Estimated Value</h5>
          <p className="text-2xl font-bold text-green-600">
            {formatPrice(property.price + 15000 * 1000000)}
          </p>
          <p className="text-sm text-gray-500">+3.1% above listing</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <h5 className="font-semibold text-gray-700">Market Trend</h5>
          <p className="text-2xl font-bold text-blue-600">↗ Rising</p>
          <p className="text-sm text-gray-500">+2.4% this quarter</p>
        </div>
      </div>

      <div className="mb-4">
        <h5 className="font-semibold text-gray-700 mb-2">6-Month Price History</h5>
        <div className="flex items-end space-x-2 h-20">
          {mockPriceHistory.map((data, index) => (
            <div key={index} className="flex-1 bg-blue-500 rounded-t" 
                 style={{height: `${(data.price / 500000) * 80}px`}}
                 title={`${data.month}: ${formatPrice(data.price * 1000000)}`}>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          {mockPriceHistory.map(data => (
            <span key={data.month}>{data.month}</span>
          ))}
        </div>
      </div>

      <div>
        <h5 className="font-semibold text-gray-700 mb-2">Comparable Properties</h5>
        <div className="space-y-2">
          {mockComparableProperties.map((comp) => (
            <div key={comp.id} className="bg-white p-3 rounded border text-sm">
              <div className="flex justify-between">
                <span>{formatPrice(comp.price * 1000000)} • {comp.sqft} sqft</span>
                <span className="text-gray-500">{comp.location}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!walletConnected) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Shield className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Connect Your Wallet</h3>
          <p className="text-gray-500">Connect your Algorand wallet to start buying or selling properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-gray-600 mt-2">Powered by Algorand Smart Contracts</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          List Property
        </button>
      </div>

      {/* Create Listing Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-bold mb-4">List Your Property</h3>
            <form onSubmit={handleCreateListing} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Property Title"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="border rounded-lg px-3 py-2"
                  required
                />
                <input
                  type="text"
                  placeholder="Location"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <input
                  type="number"
                  placeholder="Price (ALGO)"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  className="border rounded-lg px-3 py-2"
                  required
                />
                <input
                  type="number"
                  placeholder="Square Feet"
                  value={formData.sqft}
                  onChange={(e) => setFormData({...formData, sqft: e.target.value})}
                  className="border rounded-lg px-3 py-2"
                  required
                />
                <input
                  type="number"
                  placeholder="Bedrooms"
                  value={formData.bedrooms}
                  onChange={(e) => setFormData({...formData, bedrooms: e.target.value})}
                  className="border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <input
                type="number"
                placeholder="Bathrooms"
                value={formData.bathrooms}
                onChange={(e) => setFormData({...formData, bathrooms: e.target.value})}
                className="border rounded-lg px-3 py-2 w-full"
                required
              />
              <textarea
                placeholder="Property Description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="border rounded-lg px-3 py-2 w-full h-24"
                required
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Properties Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {properties.map((property) => (
          <div key={property.id} className={`border rounded-lg overflow-hidden shadow-lg transition-shadow hover:shadow-xl ${
  property.id && cancelledProperties.includes(property.id)
    ? 'bg-red-100 border-red-400'
    : 'bg-white border-gray-200'
}`}
>
            
            <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white">
              <Home className="w-16 h-16 opacity-50" />
            </div>
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-gray-800">{property.title}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  property.status === 'listed' ? 'bg-green-100 text-green-800' :
                  property.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {property.status.toUpperCase()}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  {property.location}
                </div>
                <div className="flex items-center text-gray-600">
                  <DollarSign className="w-4 h-4 mr-2" />
                  {formatPrice(property.price)}
                </div>
                <div className="flex items-center text-gray-600">
                  <User className="w-4 h-4 mr-2" />
                  {property.seller === userAddress ? 'You' : `${property.seller.slice(0, 8)}...${property.seller.slice(-4)}`}
                </div>
                <div className="flex items-center text-gray-600 text-sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  Listed {new Date(property.listingDate).toLocaleDateString()}
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-4 line-clamp-3">{property.description}</p>

              <div className="flex justify-between text-sm text-gray-500 mb-4">
                <span>{property.bedrooms} beds • {property.bathrooms} baths</span>
                <span>{property.sqft} sqft</span>
              </div>

              {/* Price Analytics Toggle */}
              <button
                onClick={() =>
                  setAnalyticsPropertyId(
                    analyticsPropertyId === property.id ? null : property.id
                  )
                }
                className="w-full mb-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all font-semibold"
              >
                {analyticsPropertyId === property.id ? 'Hide' : 'Show'} AI Price Analytics ✨
              </button>


              {analyticsPropertyId === property.id && (
                <div className="mb-4">
                  <PriceAnalytics property={property} />
                </div>
              )}


              {/* Smart Contract Info */}
              <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Smart Contract:</span>
                  <span className="font-mono text-blue-600">
                    {property.contractAddress ? `#${property.contractAddress}` : 'Deploying...'}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-600">Document Hash:</span>
                  <span className="font-mono text-green-600 text-xs">
                    {property.documentHash.slice(0, 12)}...
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
<div className="space-y-3">
  {property.seller === userAddress ? (
    // Seller actions (only if not sold)
    property.status !== 'sold' && (
      <div className="space-y-2">
        <button
          onClick={() => onConfirmTransfer(property.id!)}
          disabled={property.status !== 'pending' || isLoading}
          className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {property.status === 'pending' ? 'Confirm Transfer & Release Funds' : 'Waiting for Buyer'}
        </button>
        <button
          onClick={() => onCancelDeal(property.id!)}
          disabled={property.status === 'pending' || property.status === 'sold' || isLoading}
          className="w-full py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel Deal
        </button>
      </div>
    )
  ) : (
    // Buyer actions
    <div className="space-y-2">
      {property.status === 'listed' && (
        <button
          onClick={() => handleMakeOffer(property)}
          disabled={isLoading}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          Make Offer & Deposit Funds
        </button>
      )}
      {property.status === 'pending' && (
        <div className="text-center py-4">
          <p className="text-yellow-600 font-semibold">⏳ Offer Pending</p>
          <p className="text-sm text-gray-500">Waiting for seller confirmation</p>
          <button
            onClick={() => onCancelDeal(property.id!)}
            disabled={isLoading}
            className="mt-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            Cancel My Offer
          </button>
        </div>
      )}
    </div>
  )}
</div>

            </div>
          </div>
        ))}
      </div>

      {properties.length === 0 && !isLoading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg mt-6">
          <Home className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Properties Listed</h3>
          <p className="text-gray-500">Be the first to list a property on the platform</p>
        </div>
      )}
    </div>
  );
};

export default PropertyListing;