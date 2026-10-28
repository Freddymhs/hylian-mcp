// Hand-written from src/db/schema.sql. Keep both in sync (SSOT is schema.sql).
// Rows are `type` aliases, not interfaces: supabase-js needs the implicit index signature.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GameSource = 'steam' | 'manual';

type GameRow = {
  id: string;
  steam_appid: number | null;
  external_id: string | null;
  source: GameSource;
  name: string;
  metadata: Json | null;
  created_at: string | null;
};

type UserLibraryRow = {
  user_id: string;
  game_id: string;
  playtime_minutes: number | null;
  last_played: string | null;
  acquired_at: string | null;
};

type ReviewRow = {
  id: string;
  user_id: string;
  game_id: string;
  text: string;
  auto_rank: number | null;
  extracted_tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type UserProfileRow = {
  user_id: string;
  tag_weights: Json | null;
  computed_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      games: {
        Row: GameRow;
        Insert: Pick<GameRow, 'source' | 'name'> & Partial<GameRow>;
        Update: Partial<GameRow>;
        Relationships: [];
      };
      user_library: {
        Row: UserLibraryRow;
        Insert: Pick<UserLibraryRow, 'user_id' | 'game_id'> &
          Partial<UserLibraryRow>;
        Update: Partial<UserLibraryRow>;
        Relationships: [
          {
            foreignKeyName: 'user_library_game_id_fkey';
            columns: ['game_id'];
            isOneToOne: false;
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: ReviewRow;
        Insert: Pick<ReviewRow, 'user_id' | 'game_id' | 'text'> &
          Partial<ReviewRow>;
        Update: Partial<ReviewRow>;
        Relationships: [
          {
            foreignKeyName: 'reviews_game_id_fkey';
            columns: ['game_id'];
            isOneToOne: false;
            referencedRelation: 'games';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profile: {
        Row: UserProfileRow;
        Insert: Pick<UserProfileRow, 'user_id'> & Partial<UserProfileRow>;
        Update: Partial<UserProfileRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
