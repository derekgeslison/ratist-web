-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plot_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visual_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "script_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acting_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "originality_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "character_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "message_focused" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_action" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_horror" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_drama" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_historical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_scifi" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_thriller" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_comedy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_book_adaptation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_fantasy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_romance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_documentary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_family" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_film_noir" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_musical" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_biopic" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_crime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_western" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genre_mystery" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movies" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "overview" TEXT,
    "poster_path" TEXT,
    "backdrop_path" TEXT,
    "release_date" TEXT,
    "runtime" INTEGER,
    "mpaa_rating" TEXT,
    "tagline" TEXT,
    "budget" BIGINT,
    "revenue" BIGINT,
    "popularity" DOUBLE PRECISION,
    "trailer_key" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genres" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_genres" (
    "movie_id" TEXT NOT NULL,
    "genre_id" INTEGER NOT NULL,

    CONSTRAINT "movie_genres_pkey" PRIMARY KEY ("movie_id","genre_id")
);

-- CreateTable
CREATE TABLE "celebrities" (
    "id" TEXT NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "profile_path" TEXT,
    "known_for" TEXT,

    CONSTRAINT "celebrities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_cast" (
    "movie_id" TEXT NOT NULL,
    "celebrity_id" TEXT NOT NULL,
    "character" TEXT,
    "cast_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "movie_cast_pkey" PRIMARY KEY ("movie_id","celebrity_id")
);

-- CreateTable
CREATE TABLE "movie_ratings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "plot" DOUBLE PRECISION,
    "premise_originality" DOUBLE PRECISION,
    "storytelling" DOUBLE PRECISION,
    "character_dev" DOUBLE PRECISION,
    "pacing_climax" DOUBLE PRECISION,
    "cinematography" DOUBLE PRECISION,
    "location_costuming" DOUBLE PRECISION,
    "realism_believability" DOUBLE PRECISION,
    "artistic_effect" DOUBLE PRECISION,
    "visual_effects" DOUBLE PRECISION,
    "music_sound" DOUBLE PRECISION,
    "overall_emotion" DOUBLE PRECISION,
    "relatability" DOUBLE PRECISION,
    "meaning" DOUBLE PRECISION,
    "movingness" DOUBLE PRECISION,
    "casting" DOUBLE PRECISION,
    "acting_quality" DOUBLE PRECISION,
    "dialogue_scripting" DOUBLE PRECISION,
    "blocking_choreography" DOUBLE PRECISION,
    "appeal" DOUBLE PRECISION,
    "superficial_allure" DOUBLE PRECISION,
    "choreography" DOUBLE PRECISION,
    "overall_rating" DOUBLE PRECISION,
    "genre_action" DOUBLE PRECISION,
    "genre_horror" DOUBLE PRECISION,
    "genre_drama" DOUBLE PRECISION,
    "genre_historical" DOUBLE PRECISION,
    "genre_scifi" DOUBLE PRECISION,
    "genre_thriller" DOUBLE PRECISION,
    "genre_comedy" DOUBLE PRECISION,
    "genre_book_adaptation" DOUBLE PRECISION,
    "genre_fantasy" DOUBLE PRECISION,
    "genre_romance" DOUBLE PRECISION,
    "genre_documentary" DOUBLE PRECISION,
    "genre_family" DOUBLE PRECISION,
    "genre_film_noir" DOUBLE PRECISION,
    "genre_musical" DOUBLE PRECISION,
    "genre_biopic" DOUBLE PRECISION,
    "genre_crime" DOUBLE PRECISION,
    "genre_western" DOUBLE PRECISION,
    "genre_mystery" DOUBLE PRECISION,
    "story_score" DOUBLE PRECISION,
    "style_score" DOUBLE PRECISION,
    "emotive_score" DOUBLE PRECISION,
    "acting_score" DOUBLE PRECISION,
    "entertainment_score" DOUBLE PRECISION,
    "ratist_rating" DOUBLE PRECISION,
    "review_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movie_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_favorite_movies" (
    "user_id" TEXT NOT NULL,
    "movie_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_movies_pkey" PRIMARY KEY ("user_id","movie_id")
);

-- CreateTable
CREATE TABLE "blog_posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "cover_image" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_and_judy_debates" (
    "id" TEXT NOT NULL,
    "movie_id" INTEGER NOT NULL,
    "movie_title" TEXT NOT NULL,
    "poster_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_and_judy_debates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_and_judy_arguments" (
    "id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punch_and_judy_arguments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punch_and_judy_helpfuls" (
    "user_id" TEXT NOT NULL,
    "argument_id" TEXT NOT NULL,

    CONSTRAINT "punch_and_judy_helpfuls_pkey" PRIMARY KEY ("user_id","argument_id")
);

-- CreateTable
CREATE TABLE "punch_and_judy_overall_votes" (
    "user_id" TEXT NOT NULL,
    "debate_id" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,

    CONSTRAINT "punch_and_judy_overall_votes_pkey" PRIMARY KEY ("user_id","debate_id")
);

-- CreateTable
CREATE TABLE "forum_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "forum_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_threads" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "movies_tmdb_id_key" ON "movies"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "celebrities_tmdb_id_key" ON "celebrities"("tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "movie_ratings_user_id_movie_id_key" ON "movie_ratings"("user_id", "movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "blog_posts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "punch_and_judy_debates_movie_id_key" ON "punch_and_judy_debates"("movie_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_categories_name_key" ON "forum_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "forum_categories_slug_key" ON "forum_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "forum_threads_slug_key" ON "forum_threads"("slug");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_cast" ADD CONSTRAINT "movie_cast_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_cast" ADD CONSTRAINT "movie_cast_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_ratings" ADD CONSTRAINT "movie_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_ratings" ADD CONSTRAINT "movie_ratings_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_movies" ADD CONSTRAINT "user_favorite_movies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_movies" ADD CONSTRAINT "user_favorite_movies_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_arguments" ADD CONSTRAINT "punch_and_judy_arguments_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "punch_and_judy_debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_arguments" ADD CONSTRAINT "punch_and_judy_arguments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_helpfuls" ADD CONSTRAINT "punch_and_judy_helpfuls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_helpfuls" ADD CONSTRAINT "punch_and_judy_helpfuls_argument_id_fkey" FOREIGN KEY ("argument_id") REFERENCES "punch_and_judy_arguments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_overall_votes" ADD CONSTRAINT "punch_and_judy_overall_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punch_and_judy_overall_votes" ADD CONSTRAINT "punch_and_judy_overall_votes_debate_id_fkey" FOREIGN KEY ("debate_id") REFERENCES "punch_and_judy_debates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "forum_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "forum_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
