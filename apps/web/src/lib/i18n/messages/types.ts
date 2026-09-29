import type { enMessages } from "./en";

/**
 * English is Nova-Lumina's canonical authored dictionary. Message types are derived
 * from its key structure while widening authored string literals so future
 * translations can provide different copy without maintaining a second schema.
 */
type MessageShape<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? ReadonlyArray<MessageShape<Item>>
    : T extends object
      ? Readonly<{ [Key in keyof T]: MessageShape<T[Key]> }>
      : T;

export type LuminaMessages = MessageShape<typeof enMessages>;

export type CatalogueSearchMessages = LuminaMessages["catalogueSearch"];
export type CollectionsMessages = LuminaMessages["collections"];
export type CompareMessages = LuminaMessages["compare"];
export type CoordinateDisclosureMessages = LuminaMessages["coordinateDisclosure"];
export type DeepSkyMessages = LuminaMessages["deepSky"];
export type DiscoveriesMessages = LuminaMessages["discoveries"];
export type EntityTypeMessages = LuminaMessages["entityTypes"];
export type ExploreMessages = LuminaMessages["explore"];
export type IdentifyMessages = LuminaMessages["identify"];
export type JournalMessages = LuminaMessages["journal"];
export type LabIndexMessages = LuminaMessages["labIndex"];
export type LearnMessages = LuminaMessages["learn"];
export type MissionControlMessages = LuminaMessages["missionControl"];
export type ObjectMessages = LuminaMessages["object"];
export type ObservationPlannerMessages = LuminaMessages["observationPlanner"];
export type OfflineMessages = LuminaMessages["offline"];
export type ParticipateMessages = LuminaMessages["participate"];
export type PresentationModeMessages = LuminaMessages["presentationMode"];
export type RouteBoundaryMessages = LuminaMessages["routeBoundaries"];
export type SavedObservationPlanMessages = LuminaMessages["savedObservationPlan"];
export type SiteShellMessages = LuminaMessages["shell"];
export type SimulationLabMessages = LuminaMessages["simulationLabs"];
export type SpaceNowMessages = LuminaMessages["spaceNow"];
export type StatusMessages = LuminaMessages["status"];
export type TonightMessages = LuminaMessages["tonight"];

export type NavigationMessages = SiteShellMessages["navigation"];
export type NavigationMessageKey = keyof NavigationMessages["items"];
export type PwaStatusMessages = SiteShellMessages["pwa"];

export type NotFoundMessages = RouteBoundaryMessages["notFound"];
export type RouteErrorMessages = RouteBoundaryMessages["routeError"];

export type CollectionStateMessages = Pick<CollectionsMessages, "failures" | "shared">;
export type CollectionSaveMessages = Pick<CollectionsMessages, "failures" | "save" | "validation">;
export type CountMessageTemplates = CatalogueSearchMessages["suggestionsAvailable"];

export type SolarSystemDistanceMessages = ExploreMessages["solarSystemDistance"];
export type ExoplanetSystemsMessages = ExploreMessages["exoplanetSystems"];
export type VoyagerMessages = ExploreMessages["voyager"];
export type SystemScaleCompareMessages = ExploreMessages["systemScaleCompare"];

export type DeepSkyAtlasMessages = DeepSkyMessages["atlas"];

export type LearnLandingMessages = LearnMessages["landing"];
export type LearningLessonMessages = LearnMessages["lesson"];
export type LearningPathMessages = LearnMessages["path"];
export type LearningProgressControlsMessages = LearnMessages["progressControls"];
export type LearningSourcesMessages = LearnMessages["sources"];

export type BlackHoleRelativityMessages = SimulationLabMessages["blackHoleRelativity"];
export type EclipseSimulatorMessages = SimulationLabMessages["eclipseSimulator"];
export type HRDiagramExplorerMessages = SimulationLabMessages["hrDiagramExplorer"];
export type ImpactSimulatorMessages = SimulationLabMessages["impactSimulator"];
export type OrbitSandboxMessages = SimulationLabMessages["orbitSandbox"];
export type PlanetarySystemBuilderMessages = SimulationLabMessages["planetarySystemBuilder"];
export type RadialVelocityMessages = SimulationLabMessages["radialVelocity"];
export type RelativityVisualizationsMessages = SimulationLabMessages["relativityVisualizations"];
export type RocketMissionDesignerMessages = SimulationLabMessages["rocketMissionDesigner"];
export type ScaleExplorerMessages = SimulationLabMessages["scaleExplorer"];
export type SeasonsSimulatorMessages = SimulationLabMessages["seasonsSimulator"];
export type SpectroscopyLabMessages = SimulationLabMessages["spectroscopyLab"];
export type StellarLaboratoryMessages = SimulationLabMessages["stellarLaboratory"];
export type TelescopeBuilderMessages = SimulationLabMessages["telescopeBuilder"];
export type TransitMethodMessages = SimulationLabMessages["transitMethod"];

export type JournalEntryMessages = JournalMessages["entry"];

export type SaveObservationPlanMessages = ObservationPlannerMessages["savePlan"];
export type ObservationConditionsMessages = ObservationPlannerMessages["conditions"];
export type SkyFinderMessages = ObservationPlannerMessages["skyFinder"];

export type LaunchCenterMessages = SpaceNowMessages["launches"];
export type NearEarthMessages = SpaceNowMessages["nearEarth"];
export type SatelliteMessages = SpaceNowMessages["satellites"];
export type SpaceWeatherMessages = SpaceNowMessages["spaceWeather"];
