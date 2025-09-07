export interface Property {
  id?: number;
  title: string;
  location: string;
  price: number; // in microALGOs
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

export interface WalletAccount {
  address: string;
  name?: string;
}