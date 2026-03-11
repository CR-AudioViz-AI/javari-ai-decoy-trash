# Create Universal Payment Checkout Component

# Universal Payment Checkout Component

## Purpose

The Universal Payment Checkout component provides a robust interface for collecting payment and billing information from users, supporting multiple payment methods including card, PayPal, Apple Pay, and Google Pay. This component uses validation schemas to ensure user input is correct and adheres to defined business rules.

## Usage

To utilize the Universal Payment Checkout component, simply import it into your React application and render it within the desired parent component.

```tsx
import UniversalPaymentCheckout from '@/components/checkout/UniversalPaymentCheckout';

// Inside your component
<UniversalPaymentCheckout />;
```

## Parameters/Props

The Universal Payment Checkout component accepts the following props:

| Prop                | Type                | Description                                                                          |
|---------------------|---------------------|--------------------------------------------------------------------------------------|
| `onSubmit`          | `(data: any) => void` | Callback function that receives form data upon successful submission.               |
| `isLoading`         | `boolean`           | (Optional) Indicates whether the form is in the loading state. Defaults to `false`. |
| `errorMessage`      | `string`            | (Optional) Can display an error message if form submission fails.                   |

## Return Values

The component does not directly return values as it manages its own internal state. Instead, it calls the `onSubmit` prop with validated form data when the user submits the form. The form validation errors will be displayed through the UI if the submission is unsuccessful.

## Examples

### Basic Usage Example

Here’s how to implement the Universal Payment Checkout in your component:

```tsx
import React, { useState } from 'react';
import UniversalPaymentCheckout from '@/components/checkout/UniversalPaymentCheckout';

const PaymentPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePaymentSubmit = async (data: any) => {
    setLoading(true);
    setError('');
    
    try {
      // Process payment with data...
      console.log(data);
      // Handle success
    } catch (err) {
      setError('Payment processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <Alert title="Error" description={error} />}
      <UniversalPaymentCheckout
        onSubmit={handlePaymentSubmit}
        isLoading={loading}
      />
    </div>
  );
};

export default PaymentPage;
```

### Complete Form Example with Error Handling

```tsx
import React from 'react';
import UniversalPaymentCheckout from '@/components/checkout/UniversalPaymentCheckout';

const App = () => {
  const handlePaymentSubmit = (data: any) => {
    console.log('Payment Data:', data);
    // Implement payment processing logic here
  };

  return (
    <div>
      <h1>Complete Your Purchase</h1>
      <UniversalPaymentCheckout onSubmit={handlePaymentSubmit} />
    </div>
  );
};

export default App;
```

This component's structured approach facilitates straightforward integration into any React application while enforcing input validation for enhanced user experience and data integrity.