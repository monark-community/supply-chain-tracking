alter table "public"."actors" drop column "loation";

alter table "public"."actors" add column "location" geometry(Point,4326);


