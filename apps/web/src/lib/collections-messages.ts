import {
  COLLECTION_NAME_MAX_CODE_POINTS,
  MAX_COLLECTIONS,
  MAX_ITEMS_PER_COLLECTION,
  collectionNameProblemReason,
} from "./collections-model";
import type { StoreFailureReason } from "./collections-store";
import { formatMessageTemplate } from "./i18n/format";
import type { CollectionsMessages, CollectionSaveMessages } from "./i18n/messages/types";

export function collectionSaveMessageSlice(messages: CollectionsMessages): CollectionSaveMessages {
  return {
    failures: messages.failures,
    save: messages.save,
    validation: messages.validation,
  };
}

export function collectionNameProblemMessage(
  raw: string,
  messages: CollectionsMessages["validation"],
): string | null {
  const reason = collectionNameProblemReason(raw);
  if (reason === "blank") return messages.blankName;
  if (reason === "too-long") {
    return formatMessageTemplate(messages.tooLongName, {
      max: String(COLLECTION_NAME_MAX_CODE_POINTS),
    });
  }
  return null;
}

export function collectionDefaultNameHint(messages: CollectionsMessages["validation"]): string {
  return formatMessageTemplate(messages.defaultHint, {
    max: String(COLLECTION_NAME_MAX_CODE_POINTS),
  });
}

export function collectionRenameNameHint(messages: CollectionsMessages["validation"]): string {
  return formatMessageTemplate(messages.renameHint, {
    max: String(COLLECTION_NAME_MAX_CODE_POINTS),
  });
}

export function collectionStoreFailureMessage(
  reason: StoreFailureReason,
  messages: CollectionsMessages["failures"],
): string {
  switch (reason) {
    case "invalid-name":
      return formatMessageTemplate(messages.invalidName, {
        max: String(COLLECTION_NAME_MAX_CODE_POINTS),
      });
    case "duplicate-name":
      return messages.duplicateName;
    case "collection-limit":
      return formatMessageTemplate(messages.collectionLimit, { max: String(MAX_COLLECTIONS) });
    case "item-limit":
      return formatMessageTemplate(messages.itemLimit, { max: String(MAX_ITEMS_PER_COLLECTION) });
    case "collection-not-found":
      return messages.collectionNotFound;
    case "invalid-object":
      return messages.invalidObject;
    case "storage-unavailable":
      return messages.storageUnavailable;
    case "storage-corrupted":
      return messages.storageCorrupted;
    case "storage-write-failed":
      return messages.storageWriteFailed;
  }
}
