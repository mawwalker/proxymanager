create table if not exists proxy_nodes (
  id text primary key,
  fingerprint text not null unique,
  protocol text not null,
  source_name text not null,
  display_name text not null,
  raw_payload text not null,
  share_uri text,
  parse_status text not null,
  tags_json text not null default '[]',
  enabled integer not null default 1,
  normalized_json text not null,
  share_token text not null unique,
  created_at text not null,
  updated_at text not null
);

create table if not exists sources (
  id text primary key,
  name text not null,
  url text not null,
  kind text not null,
  refresh_interval_minutes integer not null default 15,
  last_sync_status text not null default 'idle',
  last_error text,
  last_sync_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists source_nodes (
  source_id text not null references sources(id) on delete cascade,
  proxy_id text not null references proxy_nodes(id) on delete cascade,
  primary key (source_id, proxy_id)
);

create table if not exists subscriptions (
  id text primary key,
  name text not null,
  description text not null default '',
  share_token text not null unique,
  default_format text not null default 'raw',
  created_at text not null,
  updated_at text not null
);

create table if not exists subscription_items (
  id text primary key,
  subscription_id text not null references subscriptions(id) on delete cascade,
  proxy_id text not null references proxy_nodes(id) on delete cascade,
  position integer not null,
  created_at text not null
);

create index if not exists idx_proxy_nodes_updated_at on proxy_nodes(updated_at desc);
create index if not exists idx_sources_updated_at on sources(updated_at desc);
create index if not exists idx_subscriptions_updated_at on subscriptions(updated_at desc);
create index if not exists idx_subscription_items_subscription on subscription_items(subscription_id, position);
