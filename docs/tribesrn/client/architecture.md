---
layer: client
parentDocument: '_bmad-output/shared/architecture/overview.md'
project_name: 'Tribes'
date: '2026-01-15'
status: 'flutter-era — needs React Native rewrite'
---

# Client Layer Architecture

> **⚠️ STALE — FLUTTER-ERA CONTENT**
>
> The client is moving from Flutter to React Native. Every section below describes the
> Flutter implementation as it was specified in 2026-01. Treat this file as a historical
> reference for the original architectural intent (state management strategy, kinetic
> physics, feature decomposition) — **NOT** as a current implementation guide.
>
> Action items for the rewrite:
> - Replace Riverpod with the chosen RN state library (Zustand, Redux Toolkit, Jotai, etc.)
> - Replace AutoRoute with React Navigation (or Expo Router)
> - Replace Isar with the chosen RN persistence layer (MMKV, WatermelonDB, etc.)
> - Reimplement `FlickPhysicsController` in RN (react-native-reanimated + Gesture Handler)
> - Translate the file/folder structure from `lib/` to `src/` conventions
> - Replace `openapi_generator` with an RN-compatible client generator
>
> Until the rewrite lands, this file is read-only reference.

> Cross-layer overview lives at `_bmad-output/shared/architecture/overview.md`.

---

## Frontend Initialization

```bash
flutter create tribes_app --platforms=ios
cd tribes_app

# Add dependencies
flutter pub add flutter_riverpod dio shared_preferences
flutter pub add firebase_core firebase_messaging firebase_analytics firebase_crashlytics
flutter pub add --dev openapi_generator build_runner
```

**OpenAPI Client Generation:**
```dart
// lib/openapi_config.dart
@Openapi(
  inputSpec: RemoteSpec(path: 'https://api.tribes.app/openapi.json'),
  generatorName: Generator.dio,
  outputDirectory: 'lib/api',
  additionalProperties: DioProperties(
    pubName: 'tribes_api',
    pubAuthor: 'Tribes',
  ),
)
class OpenapiConfig {}
```

Run: `flutter pub run build_runner build --delete-conflicting-outputs`

---

## Frontend Architecture

**Project Structure:**
```
lib/
├── core/                    # Shared across features
│   ├── models/              # Domain models (Contact, Label, Tribe, etc.)
│   ├── providers/           # Global Riverpod providers
│   ├── router/              # AutoRoute configuration
│   ├── theme/               # Design system tokens
│   └── utils/               # Helpers, extensions
├── features/
│   ├── onboarding/          # Domain selection, permissions
│   ├── labeling/            # Flick-to-bin, radial UI, physics
│   ├── tribes/              # Tribe management, queries
│   ├── coordination/        # Send, responses, history
│   └── profile/             # Settings, account
├── api/                     # Generated OpenAPI client
└── main.dart
```

**State Management:** Riverpod 3.10 with code generation
- AsyncNotifierProvider for API-backed state
- StateNotifierProvider for local UI state
- Generated client as data source

**Kinetic UI:**
- Custom `FlickPhysicsController` class
- Magnetic snap zones (60pt radius)
- Spring animation (200ms, critically damped)
- Haptic feedback via `HapticFeedback.mediumImpact()`
- Gesture velocity → animation parameters

**Local Persistence (Isar):**
- Cache frequently accessed contacts
- Store pending label assignments (optimistic UI)
- Offline queue for V2

**Auth Token Storage:**
- iOS Keychain via `flutter_secure_storage`

---

## Implementation Patterns (Client)

### Dart Code Naming

| Element | Convention | Example |
|---------|------------|---------|
| Files | `PascalCase.dart` | `ContactCard.dart`, `LabelingScreen.dart` |
| Classes | `PascalCase` | `ContactCard`, `FlickPhysicsController` |
| Variables/functions | `camelCase` | `contactList`, `getLabels()` |
| Constants | `UPPERCASE` | `MAX_LABELS`, `MAGNETIC_SNAP_RADIUS` |

### Flutter Provider Organization

```
lib/
├── core/
│   └── providers/           # Global/shared providers
│       ├── AuthProvider.dart
│       ├── ApiClientProvider.dart
│       └── UserProvider.dart
└── features/
    └── labeling/
        └── providers/       # Feature-specific providers
            ├── ContactsProvider.dart
            └── LabelsProvider.dart
```

### Riverpod Provider Naming

| Type | Convention | Example |
|------|------------|---------|
| Simple provider | `{name}Provider` | `contactsProvider` |
| Notifier | `{name}NotifierProvider` | `labelsNotifierProvider` |
| Family | `{name}FamilyProvider` | `contactFamilyProvider` |
| Future | `{name}FutureProvider` | `userFutureProvider` |

### State Management: AsyncValue

```dart
// Provider returns AsyncValue<T>
final contactsProvider = FutureProvider<List<Contact>>((ref) async {
  return ref.read(apiClientProvider).getContacts();
});

// Consumer handles states
contactsAsync.when(
  data: (contacts) => ContactList(contacts),
  loading: () => LoadingSpinner(),
  error: (err, stack) => ErrorSnackbar(err),
);
```

### Flutter Error Display: Snackbar

```dart
void showError(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message),
      backgroundColor: AppColors.error,
      behavior: SnackBarBehavior.floating,
    ),
  );
}
```

### Retry Strategy (Client-side)

| Context | Delays | Max Retries |
|---------|--------|-------------|
| Flutter API calls | 1s, 2s, 4s | 3 |

```dart
// Flutter retry with exponential backoff
Future<T> withRetry<T>(Future<T> Function() fn, {int maxRetries = 3}) async {
  for (var i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i == maxRetries - 1) rethrow;
      await Future.delayed(Duration(seconds: pow(2, i).toInt()));
    }
  }
  throw Exception('Unreachable');
}
```

---

## Flutter Project Structure (tribes_app)

```
tribes_app/
├── README.md
├── pubspec.yaml
├── analysis_options.yaml
├── build.yaml                        # build_runner config
├── .gitignore
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Analyze, test
│       └── release.yml               # Build iOS, upload TestFlight
│
├── ios/                              # iOS-specific config
│   ├── Runner/
│   │   ├── Info.plist                # Permissions, entitlements
│   │   └── GoogleService-Info.plist  # Firebase config
│   └── Podfile
│
├── lib/
│   ├── main.dart                     # App entry, ProviderScope, Firebase init
│   │
│   ├── core/                         # Shared across all features
│   │   ├── models/                   # Domain models
│   │   │   ├── Contact.dart
│   │   │   ├── Label.dart
│   │   │   ├── Domain.dart
│   │   │   ├── Tribe.dart            # StaticTribe, DynamicTribe
│   │   │   ├── Coordination.dart
│   │   │   ├── CoordinationResponse.dart
│   │   │   └── User.dart
│   │   │
│   │   ├── providers/                # Global providers
│   │   │   ├── AuthProvider.dart     # Firebase auth state
│   │   │   ├── ApiClientProvider.dart # Dio + generated client
│   │   │   ├── UserProvider.dart     # Current user
│   │   │   └── NotificationProvider.dart
│   │   │
│   │   ├── router/                   # AutoRoute config
│   │   │   ├── AppRouter.dart
│   │   │   └── AppRouter.gr.dart     # Generated
│   │   │
│   │   ├── theme/                    # Design system
│   │   │   ├── AppColors.dart
│   │   │   ├── AppTypography.dart
│   │   │   ├── AppSpacing.dart
│   │   │   └── AppTheme.dart
│   │   │
│   │   ├── widgets/                  # Shared UI components
│   │   │   ├── LoadingSpinner.dart
│   │   │   ├── ErrorSnackbar.dart
│   │   │   ├── ContactAvatar.dart
│   │   │   └── LabelChip.dart
│   │   │
│   │   └── utils/                    # Helpers
│   │       ├── Extensions.dart
│   │       ├── Haptics.dart
│   │       └── Retry.dart            # withRetry()
│   │
│   ├── features/
│   │   ├── onboarding/               # FR6-15, FR61-63
│   │   │   ├── screens/
│   │   │   │   ├── WelcomeScreen.dart
│   │   │   │   ├── DomainSelectionScreen.dart
│   │   │   │   ├── LabelSetupScreen.dart
│   │   │   │   └── PermissionsScreen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── DomainCard.dart
│   │   │   │   └── LabelAccordion.dart
│   │   │   └── providers/
│   │   │       └── OnboardingProvider.dart
│   │   │
│   │   ├── labeling/                 # FR16-23 (core differentiator)
│   │   │   ├── screens/
│   │   │   │   └── LabelingScreen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── RadialLabelRing.dart
│   │   │   │   ├── DomainTabBar.dart
│   │   │   │   ├── ContactToken.dart
│   │   │   │   ├── LabelSticker.dart
│   │   │   │   ├── DetailZoneCarousel.dart
│   │   │   │   └── LabelCreationSheet.dart
│   │   │   ├── controllers/
│   │   │   │   └── FlickPhysicsController.dart  # Magnetic snap, spring
│   │   │   └── providers/
│   │   │       ├── ContactQueueProvider.dart
│   │   │       ├── LabelingStateProvider.dart
│   │   │       └── ActiveDomainProvider.dart
│   │   │
│   │   ├── contacts/                 # FR1-5
│   │   │   ├── screens/
│   │   │   │   ├── ContactListScreen.dart
│   │   │   │   └── ContactDetailScreen.dart
│   │   │   ├── widgets/
│   │   │   │   └── ContactListTile.dart
│   │   │   └── providers/
│   │   │       └── ContactsProvider.dart
│   │   │
│   │   ├── tribes/                   # FR24-32
│   │   │   ├── screens/
│   │   │   │   ├── TribeListScreen.dart
│   │   │   │   ├── TribeDetailScreen.dart
│   │   │   │   └── TribeCreationScreen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── TribeCard.dart
│   │   │   │   ├── TribeQueryBuilder.dart
│   │   │   │   └── MemberPreview.dart
│   │   │   └── providers/
│   │   │       ├── TribesProvider.dart
│   │   │       └── TribeQueryProvider.dart
│   │   │
│   │   ├── coordination/             # FR33-39
│   │   │   ├── screens/
│   │   │   │   ├── CoordinationComposerScreen.dart
│   │   │   │   ├── CoordinationDetailScreen.dart
│   │   │   │   └── ResponseListScreen.dart
│   │   │   ├── widgets/
│   │   │   │   ├── ResponseCard.dart
│   │   │   │   └── ResponseSummary.dart
│   │   │   └── providers/
│   │   │       ├── CoordinationsProvider.dart
│   │   │       └── ActiveCoordinationProvider.dart
│   │   │
│   │   └── profile/                  # FR50-55, FR56-60
│   │       ├── screens/
│   │       │   ├── ProfileScreen.dart
│   │       │   ├── SettingsScreen.dart
│   │       │   └── LocationSettingsScreen.dart
│   │       ├── widgets/
│   │       │   └── ProfileHeader.dart
│   │       └── providers/
│   │           └── ProfileProvider.dart
│   │
│   └── api/                          # Generated OpenAPI client
│       ├── openapi_config.dart       # @Openapi annotation
│       └── tribes_api/               # Generated (gitignored or committed)
│           ├── lib/
│           │   ├── api.dart
│           │   ├── api_client.dart
│           │   └── model/
│           └── pubspec.yaml
│
├── test/
│   ├── test_helpers.dart
│   ├── mocks/
│   │   └── MockApiClient.dart
│   ├── core/
│   │   └── utils/
│   │       └── Retry_test.dart
│   ├── features/
│   │   ├── labeling/
│   │   │   ├── FlickPhysicsController_test.dart
│   │   │   └── RadialLabelRing_test.dart
│   │   └── tribes/
│   │       └── TribeQueryBuilder_test.dart
│   └── integration/
│       └── OnboardingFlow_test.dart
│
└── assets/
    ├── images/
    │   └── onboarding/
    └── fonts/
```
