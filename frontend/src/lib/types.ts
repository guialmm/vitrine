export type Role = "customer" | "staff" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_verified: boolean;
}

export interface TokenResponse {
  access_token: string;
  user: User;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export type Roast = "clara" | "media" | "media-escura" | "escura";

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  origin: string;
  roast: Roast | "";
  tasting_notes: string;
  price_cents: number;
  stock: number;
  image_url: string;
  category: Category | null;
}

export interface AdminProduct extends Product {
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type OrderStatus = "pending" | "paid" | "shipped" | "cancelled" | "expired";

export interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  items: OrderItem[];
  shipping: {
    name?: string;
    address?: Record<string, string | null>;
  } | null;
  created_at: string;
  expires_at: string;
  paid_at: string | null;
}

export interface AdminOrder extends Order {
  user_id: string;
  customer_email: string;
}
