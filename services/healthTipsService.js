const HealthTipModel = require('../models/HealthTipModel');
const { translateFields } = require('./translationService');

class HealthTipsService {
  constructor() {
    // No external API dependencies
  }

  // Generate health tips using only Pakistani-specific tips
  async generateComprehensiveHealthTips() {
    try {
      console.log('Generating Pakistani health tips...');
      
      // Use only Pakistani-specific tips
      const pakistaniTips = this.generatePakistaniSpecificTips();
      
      console.log(`Generated ${pakistaniTips.length} Pakistani health tips`);
      return pakistaniTips;
      
    } catch (error) {
      console.error('Error generating health tips:', error);
      return [];
    }
  }

  // Generate Pakistani-specific health tips
  generatePakistaniSpecificTips() {
    return [
      { tip: "Drink water from a clean matka or covered container to keep it cool in summer.", category: "hydration_heat", priority: "high" },
{ tip: "Add a pinch of salt and sugar to water when feeling weak in hot weather.", category: "hydration_heat", priority: "high" },
{ tip: "Keep a wet cloth on your head or neck during extreme heat.", category: "hydration_heat", priority: "high" },
{ tip: "Store drinking water away from sunlight to keep it safe and cool.", category: "hydration_heat", priority: "medium" },
{ tip: "Use light-colored cotton clothes to stay cool in hot weather.", category: "hydration_heat", priority: "medium" },
{ tip: "Drink small amounts of water throughout the day, not all at once.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid drinking water from roadside coolers unless you trust the source.", category: "hydration_heat", priority: "high" },
{ tip: "Cover water containers tightly to prevent mosquito breeding.", category: "hydration_heat", priority: "high" },
{ tip: "Drink plain water instead of sugary soft drinks to stay hydrated affordably.", category: "hydration_heat", priority: "high" },
{ tip: "Keep a small water bottle with you when traveling or working outdoors.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid heavy meals during hot hours; eat lighter foods instead.", category: "hydration_heat", priority: "medium" },
{ tip: "Sit in shade whenever possible during field or outdoor work.", category: "hydration_heat", priority: "high" },
{ tip: "Cool down by washing your face, hands, and feet regularly in summer.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid sealed rooms without ventilation during extreme heat.", category: "hydration_heat", priority: "high" },
{ tip: "Drink more water if you sweat a lot during daily chores or work.", category: "hydration_heat", priority: "medium" },
{ tip: "Add lemon or mint to water for a refreshing natural drink.", category: "hydration_heat", priority: "low" },
{ tip: "Use an umbrella or shawl to protect from direct sunlight.", category: "hydration_heat", priority: "medium" },
{ tip: "Eat fruits like watermelon and cucumber that keep you hydrated.", category: "hydration_heat", priority: "high" },
{ tip: "Take short breaks in the shade during field work.", category: "hydration_heat", priority: "high" },
{ tip: "Avoid walking barefoot on hot ground to prevent burns.", category: "hydration_heat", priority: "medium" },

{ tip: "Eat seasonal vegetables like lauki and tinda to stay cool.", category: "nutrition", priority: "medium" },
{ tip: "Avoid wasting food; cook what your family can finish.", category: "nutrition", priority: "high" },
{ tip: "Use lentils and beans as affordable sources of protein.", category: "nutrition", priority: "high" },
{ tip: "Include fresh fruits when possible; banana is a cheap, healthy option.", category: "nutrition", priority: "medium" },
{ tip: "Limit fried snacks; try boiled or grilled foods instead.", category: "nutrition", priority: "medium" },
{ tip: "Eat roti made from whole wheat for better digestion.", category: "nutrition", priority: "medium" },
{ tip: "Avoid skipping breakfast; even chai and roti help start your day.", category: "nutrition", priority: "high" },
{ tip: "Drink milk or lassi instead of sugary drinks for better nutrition.", category: "nutrition", priority: "medium" },
{ tip: "Avoid reheating rice too many times to prevent stomach upset.", category: "nutrition", priority: "medium" },
{ tip: "Keep food covered to avoid flies and dust.", category: "nutrition", priority: "high" },
{ tip: "Eat less salt to reduce risk of blood pressure.", category: "nutrition", priority: "medium" },
{ tip: "Eat slowly and chew properly for better digestion.", category: "nutrition", priority: "low" },
{ tip: "Try to include some green vegetables in one meal daily.", category: "nutrition", priority: "high" },
{ tip: "Use clean utensils and hands while preparing food.", category: "nutrition", priority: "high" },
{ tip: "Avoid eating stale food left overnight in warm weather.", category: "nutrition", priority: "high" },
{ tip: "Drink clean water before meals to help digestion.", category: "nutrition", priority: "medium" },
{ tip: "Cook with minimal oil to avoid health problems.", category: "nutrition", priority: "medium" },
{ tip: "Avoid skipping meals even if busy; eat small portions instead.", category: "nutrition", priority: "medium" },
{ tip: "Use iodized salt for healthy growth and brain development.", category: "nutrition", priority: "high" },
{ tip: "Eat guava or amla for Vitamin C boost during winters.", category: "nutrition", priority: "low" },

{ tip: "Keep drains clean to stop mosquitoes from breeding.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Wash hands with soap after using toilet and before eating.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Throw garbage away from living areas to reduce smell and germs.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Use mosquito nets, especially for children and elders.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Boil water for 5 minutes if unsure about its safety.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Cover stored food to avoid flies.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Clean water tanks regularly to prevent dirt buildup.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Avoid throwing plastic bags into open drains.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Keep children away from standing rainwater.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Trim nails weekly to prevent dirt buildup.", category: "hygiene_sanitation", priority: "low" },
{ tip: "Avoid touching eyes or mouth with unwashed hands.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Use clean cloth to cover cooked meals before serving.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Clean fans and coolers regularly to prevent dust allergies.", category: "hygiene_sanitation", priority: "low" },
{ tip: "Spray mosquito repellent in dark corners every few days.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Avoid storing stagnant water around homes.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Change bedsheets and pillow covers weekly.", category: "hygiene_sanitation", priority: "low" },
{ tip: "Use a covered bin to dispose household waste properly.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Teach children to wash hands after playing outside.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Cover mouth and nose when sneezing to avoid spreading germs.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Avoid bathing in contaminated rivers or ponds.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Make sure elders drink water often, even if they don’t feel thirsty.", category: "family_health", priority: "high" },
{ tip: "Keep young children indoors or shaded during very hot hours.", category: "family_health", priority: "high" },
{ tip: "Give children light meals and fruits instead of oily snacks.", category: "family_health", priority: "medium" },
{ tip: "Encourage family walks in the evening when weather cools down.", category: "family_health", priority: "low" },
{ tip: "Keep a basic first aid kit at home for minor injuries.", category: "family_health", priority: "high" },
{ tip: "Teach kids to wash hands before meals and after playing.", category: "family_health", priority: "high" },
{ tip: "Check on elderly neighbors during extreme weather.", category: "family_health", priority: "medium" },
{ tip: "Keep infants cool using cotton clothes and light blankets.", category: "family_health", priority: "medium" },
{ tip: "Avoid feeding cold drinks to babies; use clean boiled water.", category: "family_health", priority: "high" },
{ tip: "Spend time talking with elders; emotional care matters too.", category: "family_health", priority: "low" },
{ tip: "Keep vaccination cards safe and up to date for all children.", category: "family_health", priority: "high" },
{ tip: "Give homemade soups when anyone in the family is sick.", category: "family_health", priority: "medium" },
{ tip: "Encourage children to drink water after playing outside.", category: "family_health", priority: "medium" },
{ tip: "Avoid smoking near children or elderly at home.", category: "family_health", priority: "high" },
{ tip: "Dry baby clothes properly to avoid rashes.", category: "family_health", priority: "medium" },
{ tip: "Keep a cool, airy room for elders during hot months.", category: "family_health", priority: "medium" },
{ tip: "Teach family members how to use basic medicines safely.", category: "family_health", priority: "high" },
{ tip: "Avoid using expired medicines at home.", category: "family_health", priority: "high" },
{ tip: "Give light porridge or khichdi to children recovering from illness.", category: "family_health", priority: "medium" },
{ tip: "Keep emergency numbers written near your phone.", category: "family_health", priority: "high" },

{ tip: "Wear a cap or dupatta when working long hours in the sun.", category: "work_and_outdoors", priority: "high" },
{ tip: "Drink water every 30 minutes if you work in fields or construction.", category: "work_and_outdoors", priority: "high" },
{ tip: "Avoid carrying heavy loads alone; ask for help.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Rest under shade when feeling dizzy or too hot.", category: "work_and_outdoors", priority: "high" },
{ tip: "Use gloves if handling chemicals or paint at work.", category: "work_and_outdoors", priority: "high" },
{ tip: "Wear sturdy shoes to protect feet from sharp objects.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Keep a wet cloth handy to cool your face and neck.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Avoid working during lightning or heavy rain.", category: "work_and_outdoors", priority: "high" },
{ tip: "Drink lemon water after hard outdoor work to regain energy.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Take regular breaks to stretch and rest your back.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Avoid standing in one position for too long; move around.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Use cloth to cover mouth and nose in dusty areas.", category: "work_and_outdoors", priority: "high" },
{ tip: "Eat a light snack before going for heavy labor.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Keep your tools clean and dry to prevent injuries.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Wash hands and face after returning from outdoor work.", category: "work_and_outdoors", priority: "high" },
{ tip: "Avoid climbing wet roofs or electric poles during rain.", category: "work_and_outdoors", priority: "high" },
{ tip: "Cover your head with a wet cloth if working under strong sun.", category: "work_and_outdoors", priority: "medium" },
{ tip: "Don’t ignore dizziness; rest immediately.", category: "work_and_outdoors", priority: "high" },
{ tip: "Keep your phone charged before going out for long work hours.", category: "work_and_outdoors", priority: "low" },
{ tip: "Avoid smoking while handling petrol or fuel.", category: "work_and_outdoors", priority: "high" },

{ tip: "Sleep at least 6–8 hours for better health and focus.", category: "general_health", priority: "high" },
{ tip: "Keep a small bottle of Dettol or sanitizer in your bag.", category: "general_health", priority: "medium" },
{ tip: "Avoid unnecessary use of antibiotics; consult a doctor.", category: "general_health", priority: "high" },
{ tip: "Stretch your body for a few minutes every morning.", category: "general_health", priority: "medium" },
{ tip: "Avoid loud music in earphones; protect your hearing.", category: "general_health", priority: "medium" },
{ tip: "Don’t delay going to a clinic if a fever lasts more than three days.", category: "general_health", priority: "high" },
{ tip: "Keep emergency contact numbers saved on your phone.", category: "general_health", priority: "high" },
{ tip: "Avoid sleeping right after eating heavy food.", category: "general_health", priority: "medium" },
{ tip: "Use ORS if someone in the family has diarrhea.", category: "general_health", priority: "high" },
{ tip: "Keep your surroundings clean to stay mentally relaxed.", category: "general_health", priority: "medium" },
{ tip: "Try to sit with straight back when using phone or TV.", category: "general_health", priority: "low" },
{ tip: "Use clean bedding to prevent skin rashes.", category: "general_health", priority: "medium" },
{ tip: "Avoid self-medicating for chest pain; get checked quickly.", category: "general_health", priority: "high" },
{ tip: "Do light exercise like walking daily for 15–20 minutes.", category: "general_health", priority: "medium" },
{ tip: "Spend time in natural light during the day for better mood.", category: "general_health", priority: "low" },
{ tip: "Keep household medicines away from children.", category: "general_health", priority: "high" },
{ tip: "Take a few deep breaths when feeling stressed or angry.", category: "general_health", priority: "medium" },
{ tip: "Check expiry dates on medicines before use.", category: "general_health", priority: "high" },
{ tip: "Avoid using someone else’s medicine or glasses.", category: "general_health", priority: "medium" },
{ tip: "Keep your nails and hair trimmed and clean regularly.", category: "general_health", priority: "low" },

{ tip: "Drink water before going out in hot weather to prevent dehydration.", category: "hydration_heat", priority: "high" },
{ tip: "Keep a small towel or cloth to wipe sweat while traveling.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid cold drinks after intense heat exposure; sip cool water slowly.", category: "hydration_heat", priority: "high" },
{ tip: "Dry wet clothes in open air to avoid smell and germs.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Clean toilets with bleach weekly to reduce bacteria.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Encourage children to throw trash only in bins.", category: "family_health", priority: "medium" },
{ tip: "Use leftover vegetable water for plants instead of throwing it.", category: "general_health", priority: "low" },
{ tip: "If you feel dizzy or weak, sit down and drink water slowly.", category: "hydration_heat", priority: "high" },
{ tip: "Avoid overusing painkillers; they can harm the stomach.", category: "general_health", priority: "high" },
{ tip: "Keep your home ventilated to prevent mold and dampness.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Use local seasonal fruits like mangoes and oranges for vitamins.", category: "nutrition", priority: "medium" },
{ tip: "Store grains and flour in dry airtight containers.", category: "nutrition", priority: "medium" },
{ tip: "Keep soap near the water tap to remind everyone to use it.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Avoid leaving cooked rice uncovered; flies can infect it.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Keep an eye on children near open drains or ponds.", category: "family_health", priority: "high" },
{ tip: "If you feel too hot, splash water on wrists and feet.", category: "hydration_heat", priority: "medium" },
{ tip: "Use neem leaves in stored water to reduce mosquito larvae.", category: "hygiene_sanitation", priority: "low" },
{ tip: "Encourage family to rest early to wake up fresh.", category: "family_health", priority: "medium" },
{ tip: "Avoid eating spicy foods in extreme heat; prefer light meals.", category: "nutrition", priority: "medium" },
{ tip: "During winter, drink warm water to stay comfortable and hydrated.", category: "hydration_heat", priority: "medium" },
{ tip: "Drink a glass of water after waking up every morning.", category: "hydration_heat", priority: "high" },
{ tip: "Keep a clay matka at home for naturally cool drinking water.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid ice-cold water after heavy meals; prefer room temperature.", category: "hydration_heat", priority: "medium" },
{ tip: "Sprinkle water on the floor to cool down a hot room naturally.", category: "hydration_heat", priority: "medium" },
{ tip: "Use wet cloths on your forehead if feeling heat exhaustion.", category: "hydration_heat", priority: "high" },
{ tip: "Drink plain water before having chai to stay hydrated.", category: "hydration_heat", priority: "medium" },
{ tip: "Use shade from trees or walls when walking outside on hot days.", category: "hydration_heat", priority: "high" },
{ tip: "Avoid long bike rides without carrying drinking water.", category: "hydration_heat", priority: "high" },
{ tip: "Keep a small bottle of water for kids in school bags.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid sleeping under direct fan if you’re sweating heavily.", category: "hydration_heat", priority: "medium" },
{ tip: "Store water in clean bottles and wash them weekly.", category: "hydration_heat", priority: "high" },
{ tip: "Use wet towels instead of running water baths to cool down fast.", category: "hydration_heat", priority: "medium" },
{ tip: "Drink a glass of water before sleeping to prevent dehydration.", category: "hydration_heat", priority: "low" },
{ tip: "Add lemon and a pinch of salt to water for instant energy.", category: "hydration_heat", priority: "high" },
{ tip: "Avoid long outdoor chores during afternoon heat; prefer early hours.", category: "hydration_heat", priority: "high" },
{ tip: "Keep your head covered with a scarf or cap in sunlight.", category: "hydration_heat", priority: "high" },
{ tip: "Wet the floor in courtyards to cool the area naturally.", category: "hydration_heat", priority: "medium" },
{ tip: "Keep pets and livestock hydrated with clean water bowls.", category: "hydration_heat", priority: "medium" },
{ tip: "Use fans and cross ventilation instead of closed air rooms.", category: "hydration_heat", priority: "medium" },
{ tip: "Avoid plastic bottles left in sun; they release harmful chemicals.", category: "hydration_heat", priority: "medium" },

{ tip: "Add lentils, beans, and eggs to your meals for protein.", category: "nutrition", priority: "high" },
{ tip: "Use seasonal vegetables from local markets for freshness.", category: "nutrition", priority: "medium" },
{ tip: "Avoid reheating food multiple times; it loses nutrition.", category: "nutrition", priority: "medium" },
{ tip: "Eat home-cooked meals instead of daily street food.", category: "nutrition", priority: "high" },
{ tip: "Use small amounts of desi ghee instead of hydrogenated oils.", category: "nutrition", priority: "medium" },
{ tip: "Add lemon juice to meals to improve digestion and flavor.", category: "nutrition", priority: "medium" },
{ tip: "Include milk or yogurt daily for calcium and digestion.", category: "nutrition", priority: "high" },
{ tip: "Avoid skipping breakfast; eat simple paratha or roti with eggs.", category: "nutrition", priority: "high" },
{ tip: "Eat guava and papaya for better digestion and vitamin C.", category: "nutrition", priority: "medium" },
{ tip: "Eat dal-chawal or khichdi for a balanced, affordable meal.", category: "nutrition", priority: "high" },
{ tip: "Avoid over-salted pickles if you have blood pressure issues.", category: "nutrition", priority: "medium" },
{ tip: "Drink a glass of milk before bed for better sleep.", category: "nutrition", priority: "low" },
{ tip: "Boil milk before drinking to kill bacteria.", category: "nutrition", priority: "high" },
{ tip: "Eat one fruit daily; bananas and oranges are cheap and healthy.", category: "nutrition", priority: "high" },
{ tip: "Avoid sugary soft drinks; drink fresh lime or mint water instead.", category: "nutrition", priority: "medium" },
{ tip: "Cook vegetables lightly to keep their nutrients intact.", category: "nutrition", priority: "medium" },
{ tip: "Avoid eating too much meat in hot months; prefer lighter meals.", category: "nutrition", priority: "medium" },
{ tip: "Store cooked food in covered containers to prevent flies.", category: "nutrition", priority: "high" },
{ tip: "Avoid plastic bags for hot food; use steel or glass containers.", category: "nutrition", priority: "medium" },
{ tip: "Drink lassi or chaach instead of cold drinks in summer.", category: "nutrition", priority: "high" },

{ tip: "Sweep and mop your house daily to reduce dust and germs.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Keep bathroom drains covered to prevent mosquito breeding.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Dry washed clothes properly to avoid damp smell and fungus.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Keep trash bins covered and clean them weekly.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Don’t store standing water in buckets for too long.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Boil tap water for at least 10 minutes before drinking.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Use neem or Dettol water for washing floors once a week.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Cover food properly to prevent flies from sitting on it.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Use mosquito nets while sleeping in open areas.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Avoid throwing garbage near water sources or drains.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Clean your shoes regularly; they carry outside dust and germs.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Wash reusable water bottles daily.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Use covered latrines; avoid open defecation.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Burn or bury dry waste if collection isn’t available.", category: "hygiene_sanitation", priority: "low" },
{ tip: "Avoid stagnant water near homes during monsoon season.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Keep soap in every washroom for easy handwashing.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Wash vegetables with clean water before cutting.", category: "hygiene_sanitation", priority: "high" },
{ tip: "Clean fans and coolers regularly to prevent dust allergies.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Don’t share towels with others to prevent skin infections.", category: "hygiene_sanitation", priority: "medium" },
{ tip: "Use old toothbrushes to clean bottle caps and corners.", category: "hygiene_sanitation", priority: "low" },

{ tip: "Encourage children to play outdoor games in the evening.", category: "family_health", priority: "low" },
{ tip: "Cover infants lightly at night to avoid overheating.", category: "family_health", priority: "medium" },
{ tip: "Keep a mosquito coil or net in children’s rooms.", category: "family_health", priority: "high" },
{ tip: "Serve soft food to elders with dental issues.", category: "family_health", priority: "medium" },
{ tip: "Teach kids to use toilets properly and wash hands after.", category: "family_health", priority: "high" },
{ tip: "Avoid giving cold food to elders during winter.", category: "family_health", priority: "medium" },
{ tip: "Make ORS at home using salt, sugar, and water when needed.", category: "family_health", priority: "high" },
{ tip: "Give small sips of water to sick children regularly.", category: "family_health", priority: "high" },
{ tip: "Check that cooking gas or stoves are off before sleeping.", category: "family_health", priority: "high" },
{ tip: "Keep emergency medicines for fever and stomach issues ready.", category: "family_health", priority: "high" },
{ tip: "Avoid giving street food to young children.", category: "family_health", priority: "high" },
{ tip: "Spend family time without screens before bedtime.", category: "family_health", priority: "low" },
{ tip: "Keep windows open for fresh air in sleeping areas.", category: "family_health", priority: "medium" },
{ tip: "Ensure pregnant women drink plenty of clean water daily.", category: "family_health", priority: "high" },
{ tip: "Avoid smoking inside the house near family.", category: "family_health", priority: "high" },
{ tip: "Keep children away from burning mosquito coils directly.", category: "family_health", priority: "medium" },
{ tip: "Use cotton clothes for kids during hot weather.", category: "family_health", priority: "medium" },
{ tip: "Provide elders with easy-to-eat meals like khichdi or soup.", category: "family_health", priority: "medium" },
{ tip: "Teach children not to touch electric switches with wet hands.", category: "family_health", priority: "high" },
{ tip: "Let children drink milk or water before sleeping instead of soft drinks.", category: "family_health", priority: "medium" },
{tip:"Wash fruits bought from street vendors with clean water before eating.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Boil or filter drinking water during the monsoon season.",category:"hygiene_sanitation",priority:"high"},
{tip:"Keep kitchen waste covered to prevent flies and bad smell.",category:"hygiene_sanitation",priority:"low"},
{tip:"Dry your clothes in sunlight to kill germs naturally.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Clean water storage containers once a week with detergent.",category:"hygiene_sanitation",priority:"high"},
{tip:"Always wash hands with soap after handling animals.",category:"hygiene_sanitation",priority:"high"},
{tip:"Use separate utensils for raw and cooked food to avoid cross-contamination.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Avoid letting rainwater collect near your house.",category:"hygiene_sanitation",priority:"high"},
{tip:"Keep latrine areas dry and clean to prevent insects.",category:"hygiene_sanitation",priority:"medium"},
{tip:"If soap is unavailable, rub hands with clean ash and rinse with water.",category:"hygiene_sanitation",priority:"low"},
{tip:"Teach children to wash hands before eating and after playing.",category:"family_health",priority:"high"},
{tip:"Keep small children indoors during heavy smog days if possible.",category:"family_health",priority:"high"},
{tip:"Offer elders cool water frequently during hot days.",category:"family_health",priority:"high"},
{tip:"Make sure family members know basic first aid.",category:"family_health",priority:"medium"},
{tip:"Share leftover home-cooked food safely with neighbors instead of wasting.",category:"family_health",priority:"low"},
{tip:"Keep medicines out of children’s reach in a covered box.",category:"family_health",priority:"high"},
{tip:"If a family member has fever, use separate towels and bedding.",category:"family_health",priority:"medium"},
{tip:"Let children rest indoors during peak heat instead of outdoor games.",category:"family_health",priority:"medium"},
{tip:"Remind family to cover coughs and sneezes with elbow, not hands.",category:"family_health",priority:"medium"},
{tip:"During monsoon, check your roof for leaks to prevent damp sickness.",category:"family_health",priority:"medium"},
{tip:"Eat local seasonal foods like guava, papaya, or saag for vitamins.",category:"nutrition",priority:"medium"},
{tip:"Avoid oily fried snacks during very hot weather to stay light.",category:"nutrition",priority:"medium"},
{tip:"Drink lemon water for vitamin C and freshness.",category:"nutrition",priority:"medium"},
{tip:"Include pulses and beans regularly for protein.",category:"nutrition",priority:"medium"},
{tip:"Prefer rotis made from whole wheat flour for fiber.",category:"nutrition",priority:"low"},
{tip:"Don’t skip breakfast; it helps maintain energy for outdoor work.",category:"nutrition",priority:"high"},
{tip:"Eat boiled eggs when affordable—they’re nutritious and filling.",category:"nutrition",priority:"medium"},
{tip:"Limit very spicy food during severe heat; it can upset the stomach.",category:"nutrition",priority:"medium"},
{tip:"Try adding spinach or methi leaves to dal for extra nutrients.",category:"nutrition",priority:"low"},
{tip:"Drink milk or yogurt if available to cool the body naturally.",category:"nutrition",priority:"medium"},
{tip:"Drink plenty of clean water before leaving for outdoor work.",category:"hydration_heat",priority:"high"},
{tip:"Use a cloth around your neck soaked in water to cool off.",category:"hydration_heat",priority:"high"},
{tip:"Avoid long tea breaks in direct sun; sit in shade.",category:"hydration_heat",priority:"medium"},
{tip:"Keep a covered clay pot for naturally cool drinking water.",category:"hydration_heat",priority:"high"},
{tip:"Splash water on your face often while working in the heat.",category:"hydration_heat",priority:"medium"},
{tip:"Wear cotton clothes to let sweat evaporate easily.",category:"hydration_heat",priority:"medium"},
{tip:"Avoid eating heavy meals before going out in the heat.",category:"hydration_heat",priority:"medium"},
{tip:"Drink extra water after offering prayers during Ramzan fasting days.",category:"hydration_heat",priority:"high"},
{tip:"Don’t wait until you feel thirsty to drink water.",category:"hydration_heat",priority:"high"},
{tip:"Rest in shade for at least ten minutes every hour during outdoor work.",category:"hydration_heat",priority:"high"},
{tip:"Tie a light cloth around your head to reduce sun exposure.",category:"work_and_outdoors",priority:"medium"},
{tip:"Carry a water bottle to construction sites whenever possible.",category:"work_and_outdoors",priority:"high"},
{tip:"Avoid dark synthetic clothing while working outside.",category:"work_and_outdoors",priority:"medium"},
{tip:"Keep a small packet of salt and sugar to make oral rehydration solution if dizzy.",category:"work_and_outdoors",priority:"high"},
{tip:"Take turns resting if multiple people work in sun-exposed jobs.",category:"work_and_outdoors",priority:"medium"},
{tip:"Avoid using metal tools left in sun—they can burn your hands.",category:"work_and_outdoors",priority:"high"},
{tip:"If you feel lightheaded, sit down and drink water immediately.",category:"work_and_outdoors",priority:"high"},
{tip:"Keep first aid items like bandages and antiseptic in your workplace.",category:"work_and_outdoors",priority:"medium"},
{tip:"Protect your eyes from dust with simple glasses if available.",category:"work_and_outdoors",priority:"medium"},
{tip:"Don’t pour cold water suddenly on overheated body; cool slowly.",category:"work_and_outdoors",priority:"medium"},
{tip:"Sleep under a mosquito net during summer nights.",category:"general_health",priority:"medium"},
{tip:"Stretch your arms and legs after long work to prevent cramps.",category:"general_health",priority:"low"},
{tip:"Avoid using mobile phones while walking on busy roads.",category:"general_health",priority:"medium"},
{tip:"If feeling anxious, take slow deep breaths to relax.",category:"general_health",priority:"low"},
{tip:"Keep a simple first aid kit at home with bandages and antiseptic.",category:"general_health",priority:"medium"},
{tip:"Learn emergency contact numbers and keep them written near phone.",category:"general_health",priority:"high"},
{tip:"Avoid sleeping directly under a fan when sweating heavily.",category:"general_health",priority:"medium"},
{tip:"Try to sleep early and wake early to make use of cool morning hours.",category:"general_health",priority:"low"},
{tip:"Avoid sharing razors or toothbrushes with others.",category:"general_health",priority:"high"},
{tip:"If you feel unwell, rest first and don’t ignore persistent fever.",category:"general_health",priority:"high"},
{tip:"In case of diarrhea, start oral rehydration immediately.",category:"hygiene_sanitation",priority:"high"},
{tip:"Use covered bins to keep stray animals away from garbage.",category:"hygiene_sanitation",priority:"low"},
{tip:"Keep drinking glasses clean and covered from flies.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Sweep outdoor drains regularly to avoid standing water.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Do not reuse plastic bottles without washing them.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Keep kitchen floors dry to avoid slipping accidents.",category:"hygiene_sanitation",priority:"low"},
{tip:"Store food items in covered containers to protect from dust.",category:"hygiene_sanitation",priority:"medium"},
{tip:"If someone vomits, clean area immediately with disinfectant.",category:"hygiene_sanitation",priority:"high"},
{tip:"Check expiry dates on medicine and discard expired ones.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Avoid touching face with dirty hands after travel.",category:"hygiene_sanitation",priority:"medium"},
{tip:"Encourage children to drink water before school starts.",category:"family_health",priority:"high"},
{tip:"Check that children’s schoolbags aren’t too heavy for their backs.",category:"family_health",priority:"low"},
{tip:"Elders should wear light slippers indoors to avoid slipping.",category:"family_health",priority:"medium"},
{tip:"Teach family to close gas stoves properly after use.",category:"family_health",priority:"high"},
{tip:"Keep a bucket of sand or water nearby for small kitchen fires.",category:"family_health",priority:"high"},
{tip:"If a child has fever, sponge with lukewarm water instead of very cold.",category:"family_health",priority:"high"},
{tip:"Use fans or hand-fans for cooling during load-shedding.",category:"family_health",priority:"medium"},
{tip:"Help elders stay hydrated by reminding them every few hours.",category:"family_health",priority:"high"},
{tip:"Don’t let children play barefoot on streets.",category:"family_health",priority:"medium"},
{tip:"Store important medical papers together for emergencies.",category:"family_health",priority:"medium"},
{tip:"Drink a glass of water before eating spicy food to reduce heat.",category:"nutrition",priority:"low"},
{tip:"Include yogurt with lunch to help digestion in summers.",category:"nutrition",priority:"medium"},
{tip:"Avoid reheating rice more than once to prevent stomach illness.",category:"nutrition",priority:"medium"},
{tip:"Add lemon juice to meals; it enhances iron absorption.",category:"nutrition",priority:"low"},
{tip:"Eat small frequent meals during extreme heat instead of large ones.",category:"nutrition",priority:"medium"},
{tip:"Buy fresh vegetables from morning markets to get better quality.",category:"nutrition",priority:"low"},
{tip:"Keep dry snacks like roasted chana or nuts for energy.",category:"nutrition",priority:"medium"},
{tip:"Prefer local seasonal fruits—they’re cheaper and healthier.",category:"nutrition",priority:"medium"},
{tip:"Reduce sugary fizzy drinks; plain water is better.",category:"nutrition",priority:"high"},
{tip:"Use clean utensils while cooking to avoid contamination.",category:"nutrition",priority:"medium"},
{tip:"Refill your water bottle at every mosque or public tap when out.",category:"hydration_heat",priority:"medium"},
{tip:"Rest in shaded bus stops instead of walking in midday heat.",category:"hydration_heat",priority:"high"},
{tip:"Keep a wet handkerchief over your mouth and nose in dusty areas.",category:"hydration_heat",priority:"medium"},
{tip:"Avoid sitting too long on metal chairs exposed to sun.",category:"hydration_heat",priority:"low"},
{tip:"Drink sattu or lassi to cool the body naturally.",category:"hydration_heat",priority:"medium"},
{tip:"If you feel your head spinning, stop and find shade quickly.",category:"hydration_heat",priority:"high"},
{tip:"Encourage coworkers to share water on hot days.",category:"hydration_heat",priority:"medium"},
{tip:"Keep a small towel to wipe sweat and prevent heat rash.",category:"hydration_heat",priority:"medium"},
{tip:"During long drives, stop every hour to drink water.",category:"hydration_heat",priority:"high"},
{tip:"Cover windows with curtains to keep house cooler during heatwave.",category:"hydration_heat",priority:"medium"},
{tip:"If working under sun, wear a cap or dupatta for protection.",category:"work_and_outdoors",priority:"medium"},
{tip:"Avoid lifting very heavy objects alone; ask for help.",category:"work_and_outdoors",priority:"high"},
{tip:"Carry a cloth to wipe sweat from eyes while driving or cycling.",category:"work_and_outdoors",priority:"medium"},
{tip:"Wear sturdy footwear when walking on construction debris.",category:"work_and_outdoors",priority:"high"},
{tip:"Avoid loud earphones while walking near traffic.",category:"work_and_outdoors",priority:"medium"},
{tip:"Keep your ID and emergency contact on paper if you travel for work.",category:"work_and_outdoors",priority:"medium"},
{tip:"During rain, use plastic sheet or poncho to keep clothes dry.",category:"work_and_outdoors",priority:"medium"},
{tip:"After handling cement, wash hands properly to avoid skin burns.",category:"work_and_outdoors",priority:"high"},
{tip:"Avoid using mobile phones on rooftops during lightning.",category:"work_and_outdoors",priority:"high"},
{tip:"At construction sites, cover water pits to prevent mosquito breeding.",category:"work_and_outdoors",priority:"medium"}

    ];
  }


  // Main method to generate and store health tips
  async generateAndStoreHealthTips() {
    try {
      console.log('Starting health tips generation process...');
      
      // Generate comprehensive health tips from API and Pakistani context
      const allTips = await this.generateComprehensiveHealthTips();
      
      console.log(`Generated ${allTips.length} health tips`);
      
      // Store tips in database
      if (allTips.length > 0) {
        const result = await HealthTipModel.createMultipleHealthTips(allTips);
        console.log(`Successfully stored ${result.insertedCount} health tips in database`);
        return result;
      }
      
      return { insertedCount: 0 };
      
    } catch (error) {
      console.error('Error generating and storing health tips:', error);
      throw error;
    }
  }

  // Remove duplicate tips
  removeDuplicateTips(tips) {
    const seen = new Set();
    return tips.filter(tip => {
      const normalized = tip.tip.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  // Get health tip of the day (deterministic based on date)
  async getHealthTipOfTheDay(language = 'en') {
    try {
      // Use the existing working method from HealthTipModel
      const collection = await HealthTipModel.getCollection();
      const allTips = await collection.find({ isActive: true }).toArray();
      
      if (allTips.length === 0) {
        console.log('❌ No active health tips found in database');
        return { success: false, message: 'No health tips available' };
      }
      
      // Create a deterministic seed based on today's date
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      const seed = this.createSeedFromDate(dateString);
      
      // Use the seed to select a consistent tip for the day
      const tipIndex = seed % allTips.length;
      const dailyTip = allTips[tipIndex];
      
      // Select the appropriate tip text based on language
      // Normalize language: handle 'ur', 'urdu', 'ur-PK', etc.
      const normalizedLang = (language || 'en').toLowerCase();
      const isUrdu = normalizedLang.startsWith('ur');

      // Debug logging
      console.log(`🌐 Language detection: input="${language}", normalized="${normalizedLang}", isUrdu=${isUrdu}`);
      console.log(`📝 Tip has tipUrdu field: ${!!dailyTip.tipUrdu}, tipUrdu value: ${dailyTip.tipUrdu ? dailyTip.tipUrdu.substring(0, 50) + '...' : 'null/empty'}`);

      let tipText;
      if (isUrdu) {
        if (dailyTip.tipUrdu && dailyTip.tipUrdu.trim().length > 0) {
          // Use manual Urdu tip (highest quality)
          tipText = dailyTip.tipUrdu;
        } else {
          // GPT fallback for tips without a manual Urdu version
          // Do NOT save to tipUrdu — that field is reserved for manual entry
          try {
            const translated = await translateFields({ tip: dailyTip.tip }, 'ur');
            tipText = translated.tip || dailyTip.tip;
          } catch (_) {
            tipText = dailyTip.tip;
          }
        }
      } else {
        tipText = dailyTip.tip;
      }
      
      // Create response object with the selected language tip
      const responseTip = {
        ...dailyTip,
        tip: tipText,
        language: isUrdu ? 'ur' : 'en'
      };
      
      console.log(`📅 Daily tip selected for ${dateString} (${language}): ${tipText.substring(0, 50)}...`);
      console.log(`✅ Returning tip in language: ${responseTip.language}, text length: ${tipText.length}`);
      
      return { success: true, data: responseTip };
    } catch (error) {
      console.error('Error getting health tip of the day:', error);
      // Fallback to random selection if deterministic fails
      try {
        const fallbackTip = await HealthTipModel.getHealthTipOfTheDay();
        const isUrdu = (language === 'ur' || language === 'urdu');
        const tipText = isUrdu && fallbackTip.tipUrdu ? fallbackTip.tipUrdu : fallbackTip.tip;
        const responseTip = {
          ...fallbackTip,
          tip: tipText,
          language: isUrdu ? 'ur' : 'en'
        };
        return { success: true, data: responseTip };
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        return { success: false, message: 'Failed to get health tip' };
      }
    }
  }

  // Create a deterministic seed from date string
  createSeedFromDate(dateString) {
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
      const char = dateString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Get health tips by category
  async getHealthTipsByCategory(category, limit = 10) {
    try {
      return await HealthTipModel.getHealthTipsByCategory(category, limit);
    } catch (error) {
      console.error('Error getting health tips by category:', error);
      throw error;
    }
  }
}

module.exports = new HealthTipsService();
