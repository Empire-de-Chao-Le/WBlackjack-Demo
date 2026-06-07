import { Router, type IRouter } from "express";
import healthRouter from "./health";
import songsRouter from "./songs";
import lyricsRouter from "./lyrics";
import vocabRouter from "./vocab";
import autocompleteRouter from "./autocomplete";
import distractorsRouter from "./distractors";
import wordPoolRouter from "./word-pool";
import flashcardsRouter from "./flashcards";
import ttsRouter from "./tts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(songsRouter);
router.use(lyricsRouter);
router.use(vocabRouter);
router.use(autocompleteRouter);
router.use(distractorsRouter);
router.use(wordPoolRouter);
router.use(flashcardsRouter);
router.use(ttsRouter);

export default router;
