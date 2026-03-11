```tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  Filter, 
  Plus, 
  ShoppingCart, 
  Wallet, 
  Star, 
  TrendingUp, 
  Package, 
  History,
  MapPin,
  Zap,
  Image as ImageIcon,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/**
 * Virtual marketplace item interface
 */
interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  subcategory?: string;
  seller_id: string;
  seller_name: string;
  seller_avatar?: string;
  seller_rating: number;
  images: string[];
  condition: 'new' | 'like_new' | 'good' | 'fair';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  tags: string[];
  created_at: string;
  updated_at: string;
  status: 'available' | 'sold' | 'reserved';
  location?: string;
  is_auction: boolean;
  auction_end?: string;
  current_bid?: number;
  buy_now_price?: number;
  views: number;
  likes: number;
  properties?: Record<string, any>;
}

/**
 * Transaction record interface
 */
interface Transaction {
  id: string;
  item_id: string;
  item_title: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'cancelled' | 'disputed';
  created_at: string;
  completed_at?: string;
  transaction_type: 'purchase' | 'sale' | 'trade' | 'auction_win';
  fees: number;
  net_amount: number;
}

/**
 * User inventory item interface
 */
interface InventoryItem {
  id: string;
  user_id: string;
  item_id: string;
  item_title: string;
  item_image: string;
  acquired_at: string;
  acquisition_price: number;
  current_value: number;
  quantity: number;
  is_listed: boolean;
  listing_price?: number;
}

/**
 * Market category interface
 */
interface Category {
  id: string;
  name: string;
  icon: string;
  subcategories: string[];
  item_count: number;
}

/**
 * Price history data point
 */
interface PricePoint {
  date: string;
  price: number;
  volume: number;
}

/**
 * Search filters interface
 */
interface SearchFilters {
  query: string;
  category: string;
  subcategory: string;
  priceMin: number;
  priceMax: number;
  condition: string;
  rarity: string;
  sortBy: 'price_asc' | 'price_desc' | 'newest' | 'popular' | 'ending_soon';
  showAuctions: boolean;
  showBuyNow: boolean;
}

/**
 * CRAIverse Virtual Marketplace Page Component
 * 
 * Provides a comprehensive virtual commerce system where users can buy, sell,
 * and trade virtual goods, properties, and services with real-time updates
 * and advanced marketplace features.
 */
export default function CRAIverseMarketplacePage(): JSX.Element {
  const supabase = createClientComponentClient();

  // State management
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>('browse');
  const [showListingForm, setShowListingForm] = useState<boolean>(false);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

  // Search and filter state
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: 'all',
    subcategory: '',
    priceMin: 0,
    priceMax: 10000,
    condition: 'all',
    rarity: 'all',
    sortBy: 'newest',
    showAuctions: true,
    showBuyNow: true
  });

  // Listing form state
  const [listingForm, setListingForm] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    subcategory: '',
    condition: 'new',
    rarity: 'common',
    tags: '',
    isAuction: false,
    auctionDuration: '24',
    buyNowPrice: '',
    images: [] as File[]
  });

  /**
   * Initialize marketplace data
   */
  useEffect(() => {
    initializeMarketplace();
    setupRealtimeSubscriptions();
  }, []);

  /**
   * Filter items based on current filters
   */
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Text search
      if (filters.query && !item.title.toLowerCase().includes(filters.query.toLowerCase()) &&
          !item.description.toLowerCase().includes(filters.query.toLowerCase())) {
        return false;
      }

      // Category filter
      if (filters.category !== 'all' && item.category !== filters.category) {
        return false;
      }

      // Subcategory filter
      if (filters.subcategory && item.subcategory !== filters.subcategory) {
        return false;
      }

      // Price range filter
      if (item.price < filters.priceMin || item.price > filters.priceMax) {
        return false;
      }

      // Condition filter
      if (filters.condition !== 'all' && item.condition !== filters.condition) {
        return false;
      }

      // Rarity filter
      if (filters.rarity !== 'all' && item.rarity !== filters.rarity) {
        return false;
      }

      // Auction/Buy Now filter
      if (!filters.showAuctions && item.is_auction) {
        return false;
      }
      if (!filters.showBuyNow && !item.is_auction) {
        return false;
      }

      return item.status === 'available';
    }).sort((a, b) => {
      switch (filters.sortBy) {
        case 'price_asc':
          return a.price - b.price;
        case 'price_desc':
          return b.price - a.price;
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'popular':
          return (b.views + b.likes) - (a.views + a.likes);
        case 'ending_soon':
          if (!a.auction_end && !b.auction_end) return 0;
          if (!a.auction_end) return 1;
          if (!b.auction_end) return -1;
          return new Date(a.auction_end).getTime() - new Date(b.auction_end).getTime();
        default:
          return 0;
      }
    });
  }, [items, filters]);

  /**
   * Initialize marketplace data and user information
   */
  async function initializeMarketplace(): Promise<void> {
    try {
      setLoading(true);

      // Fetch marketplace items
      const { data: itemsData, error: itemsError } = await supabase
        .from('marketplace_items')
        .select(`
          *,
          seller:user_profiles(name, avatar_url, rating)
        `)
        .eq('status', 'available')
        .order('created_at', { ascending: false })
        .limit(100);

      if (itemsError) throw itemsError;

      // Transform data
      const transformedItems: MarketplaceItem[] = itemsData?.map(item => ({
        ...item,
        seller_name: item.seller?.name || 'Unknown',
        seller_avatar: item.seller?.avatar_url,
        seller_rating: item.seller?.rating || 0
      })) || [];

      setItems(transformedItems);

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('marketplace_categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Fetch user data
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await fetchUserData(user.id);
      }

    } catch (error) {
      console.error('Error initializing marketplace:', error);
      toast.error('Failed to load marketplace data');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetch user-specific data
   */
  async function fetchUserData(userId: string): Promise<void> {
    try {
      // Fetch user balance
      const { data: balanceData, error: balanceError } = await supabase
        .from('user_wallets')
        .select('balance')
        .eq('user_id', userId)
        .single();

      if (!balanceError && balanceData) {
        setUserBalance(balanceData.balance);
      }

      // Fetch user transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('marketplace_transactions')
        .select('*')
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!transactionsError && transactionsData) {
        setTransactions(transactionsData);
      }

      // Fetch user inventory
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('user_inventory')
        .select(`
          *,
          marketplace_item:marketplace_items(title, images)
        `)
        .eq('user_id', userId);

      if (!inventoryError && inventoryData) {
        const transformedInventory: InventoryItem[] = inventoryData.map(item => ({
          ...item,
          item_title: item.marketplace_item?.title || 'Unknown Item',
          item_image: item.marketplace_item?.images?.[0] || ''
        }));
        setInventory(transformedInventory);
      }

    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }

  /**
   * Setup real-time subscriptions for marketplace updates
   */
  function setupRealtimeSubscriptions(): void {
    // Subscribe to marketplace items changes
    const itemsSubscription = supabase
      .channel('marketplace_items')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'marketplace_items' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setItems(prev => [payload.new as MarketplaceItem, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setItems(prev => prev.map(item => 
              item.id === payload.new.id ? { ...item, ...payload.new } : item
            ));
          } else if (payload.eventType === 'DELETE') {
            setItems(prev => prev.filter(item => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to transaction updates
    const transactionsSubscription = supabase
      .channel('marketplace_transactions')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'marketplace_transactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTransactions(prev => [payload.new as Transaction, ...prev]);
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      itemsSubscription.unsubscribe();
      transactionsSubscription.unsubscribe();
    };
  }

  /**
   * Handle item purchase
   */
  async function handlePurchase(item: MarketplaceItem): Promise<void> {
    try {
      if (userBalance < item.price) {
        toast.error('Insufficient balance');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to purchase items');
        return;
      }

      // Create transaction
      const { error: transactionError } = await supabase
        .from('marketplace_transactions')
        .insert({
          item_id: item.id,
          item_title: item.title,
          buyer_id: user.id,
          seller_id: item.seller_id,
          amount: item.price,
          currency: 'CRAIcoin',
          status: 'pending',
          transaction_type: 'purchase',
          fees: item.price * 0.05, // 5% platform fee
          net_amount: item.price * 0.95
        });

      if (transactionError) throw transactionError;

      // Update item status
      const { error: itemError } = await supabase
        .from('marketplace_items')
        .update({ status: 'sold' })
        .eq('id', item.id);

      if (itemError) throw itemError;

      // Update user balance
      const { error: balanceError } = await supabase
        .from('user_wallets')
        .update({ balance: userBalance - item.price })
        .eq('user_id', user.id);

      if (balanceError) throw balanceError;

      // Add to user inventory
      const { error: inventoryError } = await supabase
        .from('user_inventory')
        .insert({
          user_id: user.id,
          item_id: item.id,
          acquired_at: new Date().toISOString(),
          acquisition_price: item.price,
          current_value: item.price,
          quantity: 1
        });

      if (inventoryError) throw inventoryError;

      toast.success('Item purchased successfully!');
      setUserBalance(prev => prev - item.price);

    } catch (error) {
      console.error('Error purchasing item:', error);
      toast.error('Failed to purchase item');
    }
  }

  /**
   * Handle item listing creation
   */
  async function handleCreateListing(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to create listings');
        return;
      }

      // Upload images if any
      const imageUrls: string[] = [];
      for (const file of listingForm.images) {
        const fileName = `${Date.now()}_${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('marketplace-images')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('marketplace-images')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }

      // Create marketplace item
      const itemData = {
        title: listingForm.title,
        description: listingForm.description,
        price: parseFloat(listingForm.price),
        category: listingForm.category,
        subcategory: listingForm.subcategory || null,
        seller_id: user.id,
        images: imageUrls,
        condition: listingForm.condition,
        rarity: listingForm.rarity,
        tags: listingForm.tags.split(',').map(tag => tag.trim()),
        status: 'available',
        is_auction: listingForm.isAuction,
        auction_end: listingForm.isAuction 
          ? new Date(Date.now() + parseInt(listingForm.auctionDuration) * 60 * 60 * 1000).toISOString()
          : null,
        buy_now_price: listingForm.buyNowPrice ? parseFloat(listingForm.buyNowPrice) : null,
        views: 0,
        likes: 0
      };

      const { error } = await supabase
        .from('marketplace_items')
        .insert(itemData);

      if (error) throw error;

      toast.success('Item listed successfully!');
      setShowListingForm(false);
      
      // Reset form
      setListingForm({
        title: '',
        description: '',
        price: '',
        category: '',
        subcategory: '',
        condition: 'new',
        rarity: 'common',
        tags: '',
        isAuction: false,
        auctionDuration: '24',
        buyNowPrice: '',
        images: []
      });

    } catch (error) {
      console.error('Error creating listing:', error);
      toast.error('Failed to create listing');
    }
  }

  /**
   * Fetch price history for selected item
   */
  async function fetchPriceHistory(itemId: string): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('marketplace_price_history')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true })
        .limit(30);

      if (error) throw error;

      const priceData: PricePoint[] = data?.map(point => ({
        date: new Date(point.created_at).toLocaleDateString(),
        price: point.price,
        volume: point.volume || 0
      })) || [];

      setPriceHistory(priceData);

    } catch (error) {
      console.error('Error fetching price history:', error);
    }
  }

  /**
   * Get rarity color
   */
  function getRarityColor(rarity: string): string {
    const colors = {
      common: 'bg-gray-500',
      uncommon: 'bg-green-500',
      rare: 'bg-blue-500',
      epic: 'bg-purple-500',
      legendary: 'bg-yellow-500'
    };
    return colors[rarity as keyof typeof colors] || colors.common;
  }

  /**
   * Format currency
   */
  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  /**
   * Render item card
   */
  function ItemCard({ item }: { item: MarketplaceItem }): JSX.Element {
    return (
      <Card 
        className="cursor-pointer hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700"
        onClick={() => {
          setSelectedItem(item);
          fetchPriceHistory(item.id);
        }}
      >
        <div className="relative">
          {item.images?.[0] ? (
            <img
              src={item.images[0]}
              alt={item.title}
              className="w-full h-48 object-cover rounded-t-lg"
            />
          ) : (
            <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-t-lg flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-gray-400" />
            </div>
          )}
          
          <Badge className={`absolute top-2 left-2 ${getRarityColor(item.rarity)} text-white`}>
            {item.rarity.toUpperCase()}
          </Badge>
          
          {item.is_auction && (
            <Badge className="absolute top-2 right-2 bg-red-500 text-white">
              AUCTION
            </Badge>
          )}
        </div>

        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg truncate">{item.title}</h3>
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 text-yellow-500 fill-current" />
              <span className="text-sm">{item.seller_rating.toFixed(1)}</span>
            </div>
          </div>

          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 line-clamp-2">
            {item.description}
          </p>

          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={item.seller_avatar} />
                <AvatarFallback>{item.seller_name[0]}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {item.seller_name}
              </span>
            </div>
            <Badge variant="outline">{item.condition}</Badge>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <span className="text-2xl font-bold text-green-600">
                {formatCurrency(item.price)} CRAIcoin
              </span>
              {item.is_auction && item.current_bid && (
                <div className="text-sm text-gray-500">
                  Current bid: {format