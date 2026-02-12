create extension if not exists "postgis" with schema "extensions";


create sequence "public"."actors_id_seq";

create table "public"."actors" (
    "id" integer not null default nextval('actors_id_seq'::regclass),
    "name" character varying(100) not null,
    "description" text,
    "category_name" character varying(50),
    "loation" geometry(Point,4326),
    "is_fairtrade" boolean,
    "is_organic" boolean,
    "is_rainforest_alliance" boolean,
    "is_bird_friendly" boolean,
    "is_carbon_neutral" boolean,
    "is_direct_trade" boolean,
    "sca_grade" numeric(4,2),
    "notes" text
);


alter sequence "public"."actors_id_seq" owned by "public"."actors"."id";

CREATE UNIQUE INDEX actors_name_key ON public.actors USING btree (name);

CREATE UNIQUE INDEX actors_pkey ON public.actors USING btree (id);

alter table "public"."actors" add constraint "actors_pkey" PRIMARY KEY using index "actors_pkey";

alter table "public"."actors" add constraint "actors_category_name_fkey" FOREIGN KEY (category_name) REFERENCES actor_categories(name) not valid;

alter table "public"."actors" validate constraint "actors_category_name_fkey";

alter table "public"."actors" add constraint "actors_name_key" UNIQUE using index "actors_name_key";

grant delete on table "public"."actors" to "anon";

grant insert on table "public"."actors" to "anon";

grant references on table "public"."actors" to "anon";

grant select on table "public"."actors" to "anon";

grant trigger on table "public"."actors" to "anon";

grant truncate on table "public"."actors" to "anon";

grant update on table "public"."actors" to "anon";

grant delete on table "public"."actors" to "authenticated";

grant insert on table "public"."actors" to "authenticated";

grant references on table "public"."actors" to "authenticated";

grant select on table "public"."actors" to "authenticated";

grant trigger on table "public"."actors" to "authenticated";

grant truncate on table "public"."actors" to "authenticated";

grant update on table "public"."actors" to "authenticated";

grant delete on table "public"."actors" to "service_role";

grant insert on table "public"."actors" to "service_role";

grant references on table "public"."actors" to "service_role";

grant select on table "public"."actors" to "service_role";

grant trigger on table "public"."actors" to "service_role";

grant truncate on table "public"."actors" to "service_role";

grant update on table "public"."actors" to "service_role";


