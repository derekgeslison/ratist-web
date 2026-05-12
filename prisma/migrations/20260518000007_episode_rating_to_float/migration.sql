-- Switch episode_ratings.rating from INT to DOUBLE PRECISION so the
-- client can store 0.5-step values (matches the main rating sliders).
-- Table was created in the prior migration and has no prod data yet,
-- so a straight ALTER TYPE without USING is fine — Postgres can
-- implicit-cast int → double precision.
ALTER TABLE "episode_ratings"
  ALTER COLUMN "rating" TYPE DOUBLE PRECISION;
