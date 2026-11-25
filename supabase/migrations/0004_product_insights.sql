create table if not exists funnel_events (
  id          bigserial primary key,
  visit_id    uuid not null,
  tool_id     text not null,
  stage       text not null check (stage in ('tool_opened', 'file_added', 'result_ready', 'download_started')),
  sequence    integer not null check (sequence between 1 and 1000),
  created_at  timestamptz not null default now(),
  unique (visit_id, sequence)
);

create index if not exists funnel_events_visit_stage_idx
  on funnel_events (visit_id, stage);

create index if not exists funnel_events_tool_stage_idx
  on funnel_events (tool_id, stage);

create index if not exists funnel_events_created_at_idx
  on funnel_events (created_at desc);

create table if not exists product_feedback (
  id          bigserial primary key,
  visit_id    uuid not null,
  tool_id     text,
  sentiment   text not null check (sentiment in ('works-well', 'could-be-easier', 'found-a-problem')),
  created_at  timestamptz not null default now()
);

create index if not exists product_feedback_visit_created_idx
  on product_feedback (visit_id, created_at desc);

create index if not exists product_feedback_sentiment_idx
  on product_feedback (sentiment, created_at desc);

alter table funnel_events enable row level security;
alter table product_feedback enable row level security;

revoke all on table funnel_events from anon, authenticated;
revoke all on table product_feedback from anon, authenticated;
