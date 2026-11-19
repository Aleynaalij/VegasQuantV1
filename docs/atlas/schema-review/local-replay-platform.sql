-- DISPOSABLE NATIVE POSTGRES REPLAY ONLY. NEVER A HOSTED PREPARATION INPUT.
-- Managed platform stand-ins: no credentials, jobs execute nothing, network calls throw.
create role anon;
create role authenticated;
create role service_role bypassrls;
create role supabase_auth_admin;
create role supabase_storage_admin;
create schema auth;create schema storage;create schema vault;create schema extensions;
create schema cron;create schema net;
create table auth.users(id uuid primary key,instance_id uuid,aud text,role text,email text,phone text,encrypted_password text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),banned_until timestamptz,deleted_at timestamptz,is_anonymous boolean default false,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',last_sign_in_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz,aal text);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
grant usage on schema auth,storage to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,metadata jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text);
create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare n bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid into n;return n;end$$;
create function cron.unschedule(text) returns boolean language plpgsql as $$begin delete from cron.job where jobname=$1;return found;end$$;
create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=$1;return found;end$$;
create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$begin raise exception 'Local replay forbids outbound calls';end$$;

create publication supabase_realtime;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
create table net._http_response(id bigint,status_code integer,content text);
create function cron.alter_job(job_id bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language plpgsql as $$begin update cron.job j set schedule=coalesce(alter_job.schedule,j.schedule),command=coalesce(alter_job.command,j.command),active=coalesce(alter_job.active,j.active) where jobid=job_id;end$$;
create extension pgcrypto with schema extensions;
-- Unusable, local-only placeholder satisfies a historical scheduler precondition.
-- net.http_post always raises; this is never a hosted vault seed or real credential.
insert into vault.secrets(name,secret) values('vq_source_sync_token','LOCAL_REPLAY_PLACEHOLDER_NOT_A_CREDENTIAL');
alter table cron.job add column username text default 'postgres',add column database text default current_database();
