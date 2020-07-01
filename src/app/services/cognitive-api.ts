export interface ImageAnalisys {
  categories?: CategoriesEntity[] | null;
  adult: Adult;
  tags?: LandmarksEntityOrTagsEntity[] | null;
  description: Description;
  requestId: string;
  metadata: Metadata;
  faces?: FacesEntity[] | null;
  color: Color;
  imageType: ImageType;
}
export interface CategoriesEntity {
  name: string;
  score: number;
  detail?: Detail | null;
}
export interface Detail {
  celebrities?: CelebritiesEntity[] | null;
  landmarks?: LandmarksEntityOrTagsEntity[] | null;
}
export interface CelebritiesEntity {
  name: string;
  faceRectangle: FaceRectangle;
  confidence: number;
}
export interface FaceRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface LandmarksEntityOrTagsEntity {
  name: string;
  confidence: number;
}
export interface Adult {
  isAdultContent: boolean;
  isRacyContent: boolean;
  adultScore: number;
  racyScore: number;
}
export interface Description {
  tags?: string[] | null;
  captions?: CaptionsEntity[] | null;
}
export interface CaptionsEntity {
  text: string;
  confidence: number;
}
export interface Metadata {
  width: number;
  height: number;
  format: string;
}
export interface FacesEntity {
  age: number;
  gender: string;
  faceRectangle: FaceRectangle;
}
export interface Color {
  dominantColorForeground: string;
  dominantColorBackground: string;
  dominantColors?: string[] | null;
  accentColor: string;
  isBWImg: boolean;
}
export interface ImageType {
  clipArtType: number;
  lineDrawingType: number;
}
