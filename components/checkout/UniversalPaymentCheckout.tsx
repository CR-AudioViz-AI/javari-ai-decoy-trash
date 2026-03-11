```tsx
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CreditCard,
  Smartphone,
  Globe,
  Shield,
  Loader2,
  AlertCircle,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Validation schemas
const billingAddressSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone number is required'),
  address1: z.string().min(1, 'Address is required'),
  address2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State/Province is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(1, 'Country is required'),
});

const paymentSchema = z.object({
  paymentMethod: z.enum(['card', 'paypal', 'applepay', 'googlepay']),
  currency: z.string().min(3),
  billingAddress: billingAddressSchema,
  savePaymentMethod: z.boolean().optional(),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: 'You must agree to the terms and conditions',
  }),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

// Types and interfaces
interface PaymentMethod {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  supported: boolean;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
  rate: number;
}

interface OrderItem {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  price: number;
  image?: string;
}

interface TaxInfo {
  rate: number;
  amount: number;
  region: string;
}

interface UniversalPaymentCheckoutProps {
  /** Order items to display in summary */
  orderItems: OrderItem[];
  /** Base currency for pricing */
  baseCurrency?: string;
  /** Available currencies */
  availableCurrencies?: Currency[];
  /** Available payment methods */
  availablePaymentMethods?: PaymentMethod[];
  /** Tax calculation configuration */
  taxConfig?: {
    enabled: boolean;
    calculateByRegion: boolean;
  };
  /** Discount configuration */
  discountConfig?: {
    code?: string;
    amount?: number;
    type?: 'fixed' | 'percentage';
  };
  /** Loading states */
  isProcessing?: boolean;
  isLoadingRates?: boolean;
  /** Error handling */
  error?: string;
  /** Success callback */
  onPaymentSuccess?: (data: PaymentFormData & { orderId: string }) => void;
  /** Error callback */
  onPaymentError?: (error: string) => void;
  /** Step change callback */
  onStepChange?: (step: 'payment' | 'review' | 'processing' | 'success') => void;
  /** Mobile breakpoint */
  mobileBreakpoint?: number;
  /** Accessibility configuration */
  accessibilityConfig?: {
    announceSteps: boolean;
    highContrast: boolean;
  };
  className?: string;
}

const defaultPaymentMethods: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    icon: CreditCard,
    description: 'Visa, MasterCard, American Express',
    supported: true,
  },
  {
    id: 'paypal',
    name: 'PayPal',
    icon: Globe,
    description: 'Pay with your PayPal account',
    supported: true,
  },
  {
    id: 'applepay',
    name: 'Apple Pay',
    icon: Smartphone,
    description: 'Touch ID or Face ID',
    supported: typeof window !== 'undefined' && 'ApplePaySession' in window,
  },
];

const defaultCurrencies: Currency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1.0 },
  { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.85 },
  { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.73 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rate: 110.0 },
];

const countries = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'AU', name: 'Australia' },
];

export default function UniversalPaymentCheckout({
  orderItems,
  baseCurrency = 'USD',
  availableCurrencies = defaultCurrencies,
  availablePaymentMethods = defaultPaymentMethods,
  taxConfig = { enabled: true, calculateByRegion: true },
  discountConfig,
  isProcessing = false,
  isLoadingRates = false,
  error,
  onPaymentSuccess,
  onPaymentError,
  onStepChange,
  mobileBreakpoint = 768,
  accessibilityConfig = { announceSteps: true, highContrast: false },
  className,
}: UniversalPaymentCheckoutProps) {
  const [currentStep, setCurrentStep] = useState<'payment' | 'review' | 'processing' | 'success'>('payment');
  const [selectedCurrency, setSelectedCurrency] = useState(baseCurrency);
  const [taxInfo, setTaxInfo] = useState<TaxInfo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paymentMethod: 'card',
      currency: selectedCurrency,
      billingAddress: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address1: '',
        address2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'US',
      },
      savePaymentMethod: false,
      agreeToTerms: false,
    },
  });

  const watchedValues = form.watch();
  const selectedPaymentMethod = watchedValues.paymentMethod;
  const billingCountry = watchedValues.billingAddress?.country;

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < mobileBreakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [mobileBreakpoint]);

  // Tax calculation based on billing address
  useEffect(() => {
    if (taxConfig.enabled && taxConfig.calculateByRegion && billingCountry) {
      const calculateTax = () => {
        const taxRates: Record<string, number> = {
          US: 0.08,
          CA: 0.13,
          GB: 0.20,
          DE: 0.19,
          FR: 0.20,
          JP: 0.10,
          AU: 0.10,
        };

        const rate = taxRates[billingCountry] || 0;
        const amount = subtotal * rate;
        
        setTaxInfo({
          rate,
          amount,
          region: countries.find(c => c.code === billingCountry)?.name || billingCountry,
        });
      };

      calculateTax();
    }
  }, [billingCountry, taxConfig]);

  // Currency conversion
  const currentCurrency = availableCurrencies.find(c => c.code === selectedCurrency) || availableCurrencies[0];

  const convertPrice = (price: number) => {
    return price * currentCurrency.rate;
  };

  // Order calculations
  const subtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }, [orderItems]);

  const discountAmount = useMemo(() => {
    if (!discountConfig) return 0;
    return discountConfig.type === 'percentage' 
      ? subtotal * (discountConfig.amount || 0) / 100
      : discountConfig.amount || 0;
  }, [discountConfig, subtotal]);

  const taxAmount = taxInfo?.amount || 0;
  const total = subtotal - discountAmount + taxAmount;

  // Step management
  const handleStepChange = (step: typeof currentStep) => {
    setCurrentStep(step);
    onStepChange?.(step);
    
    if (accessibilityConfig.announceSteps) {
      const announcements: Record<typeof step, string> = {
        payment: 'Payment information step',
        review: 'Order review step',
        processing: 'Processing payment',
        success: 'Payment successful',
      };
      
      // Announce to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.textContent = announcements[step];
      announcement.className = 'sr-only';
      document.body.appendChild(announcement);
      
      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    }
  };

  const onSubmit = async (data: PaymentFormData) => {
    try {
      handleStepChange('processing');
      
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const orderId = `order_${Date.now()}`;
      
      onPaymentSuccess?.({
        ...data,
        orderId,
      });
      
      handleStepChange('success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      onPaymentError?.(errorMessage);
    }
  };

  const PaymentMethodSelector = () => (
    <div className="space-y-4">
      <Label className="text-base font-medium">Payment Method</Label>
      <div className="grid gap-3">
        {availablePaymentMethods
          .filter(method => method.supported)
          .map((method) => (
            <Card
              key={method.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                selectedPaymentMethod === method.id
                  ? "ring-2 ring-primary border-primary"
                  : "border-border",
                accessibilityConfig.highContrast && "border-2"
              )}
              onClick={() => form.setValue('paymentMethod', method.id as any)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  form.setValue('paymentMethod', method.id as any);
                }
              }}
              aria-label={`Select ${method.name} payment method`}
            >
              <CardContent className="flex items-center space-x-4 p-4">
                <method.icon className="h-6 w-6 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{method.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {method.description}
                  </div>
                </div>
                {selectedPaymentMethod === method.id && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );

  const CurrencySelector = () => (
    <div className="space-y-2">
      <Label htmlFor="currency-select">Currency</Label>
      <Select
        value={selectedCurrency}
        onValueChange={setSelectedCurrency}
      >
        <SelectTrigger id="currency-select" aria-label="Select currency">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableCurrencies.map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <div className="flex items-center space-x-2">
                <span>{currency.symbol}</span>
                <span>{currency.code}</span>
                <span className="text-muted-foreground">- {currency.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isLoadingRates && (
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Updating exchange rates...</span>
        </div>
      )}
    </div>
  );

  const BillingAddressForm = () => (
    <div className="space-y-4">
      <Label className="text-base font-medium">Billing Address</Label>
      <div className="grid gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Controller
              name="billingAddress.firstName"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="firstName"
                    placeholder="First name"
                    aria-invalid={!!fieldState.error}
                    aria-describedby={fieldState.error ? "firstName-error" : undefined}
                  />
                  {fieldState.error && (
                    <div id="firstName-error" className="text-sm text-destructive mt-1">
                      {fieldState.error.message}
                    </div>
                  )}
                </div>
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Controller
              name="billingAddress.lastName"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="lastName"
                    placeholder="Last name"
                    aria-invalid={!!fieldState.error}
                    aria-describedby={fieldState.error ? "lastName-error" : undefined}
                  />
                  {fieldState.error && (
                    <div id="lastName-error" className="text-sm text-destructive mt-1">
                      {fieldState.error.message}
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Controller
            name="billingAddress.email"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  aria-invalid={!!fieldState.error}
                  aria-describedby={fieldState.error ? "email-error" : undefined}
                />
                {fieldState.error && (
                  <div id="email-error" className="text-sm text-destructive mt-1">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number *</Label>
          <Controller
            name="billingAddress.phone"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <Input
                  {...field}
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  aria-invalid={!!fieldState.error}
                  aria-describedby={fieldState.error ? "phone-error" : undefined}
                />
                {fieldState.error && (
                  <div id="phone-error" className="text-sm text-destructive mt-1">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address1">Street Address *</Label>
          <Controller
            name="billingAddress.address1"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <Input
                  {...field}
                  id="address1"
                  placeholder="123 Main Street"
                  aria-invalid={!!fieldState.error}
                  aria-describedby={fieldState.error ? "address1-error" : undefined}
                />
                {fieldState.error && (
                  <div id="address1-error" className="text-sm text-destructive mt-1">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address2">Apartment, Suite, etc. (Optional)</Label>
          <Controller
            name="billingAddress.address2"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                id="address2"
                placeholder="Apt 4B"
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Controller
              name="billingAddress.city"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="city"
                    placeholder="New York"
                    aria-invalid={!!fieldState.error}
                    aria-describedby={fieldState.error ? "city-error" : undefined}
                  />
                  {fieldState.error && (
                    <div id="city-error" className="text-sm text-destructive mt-1">
                      {fieldState.error.message}
                    </div>
                  )}
                </div>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State/Province *</Label>
            <Controller
              name="billingAddress.state"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="state"
                    placeholder="NY"
                    aria-invalid={!!fieldState.error}
                    aria-describedby={fieldState.error ? "state-error" : undefined}
                  />
                  {fieldState.error && (
                    <div id="state-error" className="text-sm text-destructive mt-1">
                      {fieldState.error.message}
                    </div>
                  )}
                </div>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal Code *</Label>
            <Controller
              name="billingAddress.postalCode"
              control={form.control}
              render={({ field, fieldState }) => (
                <div>
                  <Input
                    {...field}
                    id="postalCode"
                    placeholder="10001"
                    aria-invalid={!!fieldState.error}
                    aria-describedby={fieldState.error ? "postalCode-error" : undefined}
                  />
                  {fieldState.error && (
                    <div id="postalCode-error" className="text-sm text-destructive mt-1">
                      {fieldState.error.message}
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="country">Country *</Label>
          <Controller
            name="billingAddress.country"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="country" aria-label="Select country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.error && (
                  <div className="text-sm text-destructive mt-1">
                    {fieldState.error.message}
                  </div>
                )}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );

  const OrderSummary = () => (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <span>Order Summary</span>
          <Badge variant="secondary">{orderItems.length} items</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-