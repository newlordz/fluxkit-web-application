-- Gateways need the metadata the admin UI renders. Secrets stay server-side and
-- are never seeded with real values.
alter table payment_gateways add column if not exists webhook_secret text;
alter table payment_gateways add column if not exists currency text not null default 'GHS';
alter table payment_gateways add column if not exists notes text;
alter table payment_gateways add column if not exists endpoint_url text;
alter table payment_gateways add column if not exists description text;

update payment_gateways
   set currency = 'GHS',
       description = 'Modern payments for Africa and global cards (Cards, Mobile Money, Bank Transfer, Apple Pay).',
       notes = 'Supports GHS (Ghana Cedis), NGN (Naira), USD, ZAR, KES.'
 where id = 'paystack';

insert into payment_gateways (id, name, description, enabled, mode, currency, notes)
values
  ('stripe', 'Stripe', 'Global credit card processing, Apple Pay, Google Pay, and recurring subscription checkouts.', false, 'test', 'USD', 'Supports 135+ global currencies, 3D Secure, and Stripe Billing webhooks.'),
  ('flutterwave', 'Flutterwave', 'Pan-African and international checkout gateway supporting cards, USSD, and MPesa.', false, 'test', 'USD', 'Requires FLWPUBK and FLWSECK keys from Flutterwave Dashboard.'),
  ('custom', 'Custom Payment Webhook / API', 'Connect your self-hosted backend, LemonSqueezy, Paddle, or custom billing API.', false, 'test', 'USD', 'Sends HMAC-signed JSON payload to your custom endpoint.')
on conflict (id) do nothing;
