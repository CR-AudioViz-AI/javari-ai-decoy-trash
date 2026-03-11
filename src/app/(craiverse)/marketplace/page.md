# Build CRAIverse Virtual Marketplace Module

# CRAIverse Virtual Marketplace Module

## Purpose
The CRAIverse Virtual Marketplace Module provides a user-friendly interface for buyers and sellers to interact and transact within an online marketplace environment. It supports item listing, searching, filtering, and transaction management.

## Usage
The marketplace component can be imported and used in your React application. It manages the state for items, handles interactions, and displays items in a structured format using cards. The module also integrates with Supabase for authentication and data management.

### Example
```tsx
import Marketplace from './src/app/(craiverse)/marketplace/page';

function App() {
  return (
    <div>
      <Marketplace />
    </div>
  );
}

export default App;
```

## Parameters/Props
The module does not expose additional props directly but manages internal state for user actions and data fetching. The following key functions handle the pivotal operations:

1. **createClientComponentClient**: Initializes Supabase client for authentication.
   
2. **useEffect**: Manages component lifecycle for data loading.

3. **useMemo**: Optimizes rendering for expensive calculations.

4. **State Variables**:
   - `items`: Array of `MarketplaceItem` objects representing the marketplace items.
   - `isLoading`: Boolean to manage loading states.
   - `error`: Error handling for data fetching and rendering.

## Return Values
The primary return of the marketplace component is a React element containing:
- Item cards with detailed information.
- UI for searching, filtering, and managing items.
- Dialogs for item creation and transaction management.
  
Additionally, the module provides visual feedback via toasts for user actions (e.g., adding an item, bidding).

## Interfaces
### MarketplaceItem
The interface `MarketplaceItem` defines the structure of an item in the marketplace:
- `id`: Unique identifier for the item.
- `title`: Title of the item.
- `description`: Description of the item.
- `price`: Price of the item.
- `category`: Category of the item.
- `subcategory` (optional): Subcategory of the item.
- `seller_id`: Unique identifier of the seller.
- `seller_name`: Name of the seller.
- `seller_avatar` (optional): URL of the seller's avatar.
- `seller_rating`: Seller's rating score.
- `images`: Array of image URLs for the item.
- `condition`: Condition of the item (new, like new, good, fair).
- `rarity`: Rarity of the item (common, uncommon, etc.).
- `tags`: Array of tags associated with the item.
- `created_at`: Timestamp for when the item was created.
- `updated_at`: Timestamp for the last item update.
- `status`: Status of the item (available, sold, reserved).
- `location` (optional): Location of the seller.
- `is_auction`: Boolean indicating if the item is for auction.
- `auction_end` (optional): Timestamp for auction end.
- `current_bid` (optional): Current highest bid.
- `buy_now_price` (optional): Price to buy the item immediately.
- `views`: Number of views.
- `likes`: Number of likes.
- `properties` (optional): Additional properties as a key-value pair.

This module serves as a foundational block for building and managing an online marketplace in your application.