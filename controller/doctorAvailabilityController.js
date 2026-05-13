// controller/doctorAvailabilityController.js
const DoctorAvailability = require("../models/DoctorAvailabilityModel");

/**
 * Generate time slots from start time, end time, duration, and break time
 */
function generateTimeSlots(startTime, endTime, duration, breakTime) {
  const slots = [];
  
  // Parse times (format: "HH.MM AM/PM" or "HH:MM AM/PM")
  const parseTime = (timeStr) => {
    const cleaned = timeStr.replace(/\./g, ':');
    const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const amPm = match[3].toUpperCase();
    
    if (amPm === 'PM' && hours !== 12) hours += 12;
    if (amPm === 'AM' && hours === 12) hours = 0;
    
    return { hours, minutes };
  };

  const formatTime = (hours, minutes) => {
    const period = hours >= 12 ? 'PM' : 'AM';
    let displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    // Don't pad hours with leading zero for single digits (e.g., "5:00 PM" not "05:00 PM")
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const start = parseTime(startTime);
  const end = parseTime(endTime);
  
  if (!start || !end) {
    throw new Error('Invalid time format');
  }

  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const durationMin = parseInt(duration, 10);
  const breakMin = parseInt(breakTime, 10);

  let currentMinutes = startMinutes;

  // Generate slots - include slots that can start before or at the end time
  while (currentMinutes < endMinutes) {
    // Only add slot if it can complete within the end time
    if (currentMinutes + durationMin <= endMinutes) {
      const slotHours = Math.floor(currentMinutes / 60);
      const slotMins = currentMinutes % 60;
      const slotTime = formatTime(slotHours, slotMins);
      
      slots.push({
        time: slotTime,
        status: "available",
        appointmentId: null
      });
    }

    // Move to next slot (duration + break)
    currentMinutes += durationMin + breakMin;
  }

  return slots;
}

/**
 * Create or update doctor availability
 */
exports.createOrUpdateAvailability = async (req, res) => {
  try {
    const { doctorId, date, startTime, endTime, appointmentDuration, breakTime } = req.body;

    if (!doctorId || !date || !startTime || !endTime || !appointmentDuration || !breakTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: doctorId, date, startTime, endTime, appointmentDuration, breakTime"
      });
    }

    // Generate time slots
    let timeSlots = generateTimeSlots(startTime, endTime, appointmentDuration, breakTime);
    
    // If the date is today, filter out past time slots
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTime = currentHours * 60 + currentMinutes;
      
      // Parse time helper
      const parseTime = (timeStr) => {
        const cleaned = timeStr.replace(/\./g, ':');
        const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const amPm = match[3].toUpperCase();
        if (amPm === 'PM' && hours !== 12) hours += 12;
        if (amPm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      
      // Filter out past slots
      timeSlots = timeSlots.filter(slot => {
        const slotTime = parseTime(slot.time);
        return slotTime !== null && slotTime >= currentTime;
      });
    }
    
    const totalSlots = timeSlots.length.toString();
    const availableSlots = totalSlots;
    const bookedSlots = "0";

    // Check if availability already exists for this doctor and date
    let availability = await DoctorAvailability.findOne({ doctorId, date });

    if (availability) {
      // Update existing availability
      availability.timeSlots = timeSlots;
      availability.totalSlots = totalSlots;
      availability.availableSlots = availableSlots;
      availability.bookedSlots = bookedSlots;
      availability.updatedAt = new Date();
      await availability.save();
    } else {
      // Create new availability
      availability = await DoctorAvailability.create({
        doctorId,
        date,
        timeSlots,
        totalSlots,
        bookedSlots,
        availableSlots
      });
    }

    res.status(200).json({
      success: true,
      message: "Availability saved successfully",
      availability
    });
  } catch (error) {
    console.error("Error creating/updating availability:", error);
    res.status(500).json({
      success: false,
      message: "Error saving availability",
      error: error.message
    });
  }
};

/**
 * Helper function to parse time string to minutes
 */
function parseTimeToMinutes(timeStr) {
  const cleaned = timeStr.replace(/\./g, ':');
  const match = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const amPm = match[3].toUpperCase();
  
  if (amPm === 'PM' && hours !== 12) hours += 12;
  if (amPm === 'AM' && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
}

/**
 * Helper function to filter out past time slots and update availability
 * This removes past slots only if they weren't booked (keeps booked slots for history)
 */
async function filterPastTimeSlots(availability) {
  const today = new Date().toISOString().split('T')[0];
  
  // Only filter if the date is today
  if (availability.date !== today) {
    return availability;
  }
  
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHours * 60 + currentMinutes;
  
  // Filter out past slots only if they weren't booked
  // Keep booked slots even if past (for history)
  const originalSlotCount = availability.timeSlots.length;
  const filteredSlots = availability.timeSlots.filter(slot => {
    const slotTime = parseTimeToMinutes(slot.time);
    if (slotTime === null) return false;
    
    // Keep slot if it's in the future OR if it's booked (for history)
    if (slot.status === "booked") {
      return true; // Keep booked slots even if past
    }
    
    // Remove unbooked past slots
    return slotTime >= currentTime;
  });
  
  // If slots were filtered out, update the availability
  if (filteredSlots.length < originalSlotCount) {
    const bookedCount = filteredSlots.filter(s => s.status === "booked").length;
    const totalCount = filteredSlots.length;
    
    availability.timeSlots = filteredSlots;
    availability.totalSlots = totalCount.toString();
    availability.bookedSlots = bookedCount.toString();
    availability.availableSlots = (totalCount - bookedCount).toString();
    availability.updatedAt = new Date();
    
    // Save the updated availability to the database
    await availability.save();
  }
  
  return availability;
}

/**
 * Get availability by doctor ID and date
 */
exports.getAvailabilityByDoctorAndDate = async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID and date are required"
      });
    }

    const availability = await DoctorAvailability.findOne({ doctorId, date });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: "No availability found for this doctor and date"
      });
    }

    // Filter out past time slots
    const filteredAvailability = await filterPastTimeSlots(availability);

    res.status(200).json({
      success: true,
      availability: filteredAvailability
    });
  } catch (error) {
    console.error("Error fetching availability:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching availability",
      error: error.message
    });
  }
};

/**
 * Helper function to check if schedule is expired based on date + time
 */
function isScheduleExpired(availability) {
  const now = new Date();
  const scheduleDate = new Date(availability.date + 'T00:00:00');
  
  // If schedule date is more than 1 day in the future, it's not expired
  const daysDiff = Math.floor((scheduleDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 1) return false;
  
  // If schedule date is today or in the past, check the latest time slot
  if (availability.timeSlots && availability.timeSlots.length > 0) {
    // Find the latest time slot
    let latestTimeMinutes = -1;
    for (const slot of availability.timeSlots) {
      const slotMinutes = parseTimeToMinutes(slot.time);
      if (slotMinutes !== null && slotMinutes > latestTimeMinutes) {
        latestTimeMinutes = slotMinutes;
      }
    }
    
    // If we found a time slot, create a datetime for the schedule's latest time
    if (latestTimeMinutes >= 0) {
      const scheduleDateTime = new Date(availability.date + 'T00:00:00');
      const hours = Math.floor(latestTimeMinutes / 60);
      const minutes = latestTimeMinutes % 60;
      scheduleDateTime.setHours(hours, minutes, 0, 0);
      
      // Schedule is expired if current datetime is strictly greater than schedule datetime
      return now > scheduleDateTime;
    }
  }
  
  // If no time slots, check if date has passed (end of day)
  scheduleDate.setHours(23, 59, 59, 999);
  return now > scheduleDate;
}

/**
 * Get all availability for a doctor
 */
exports.getAvailabilityByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required"
      });
    }

    const availabilities = await DoctorAvailability.find({ doctorId })
      .sort({ date: 1 });

    // Filter out expired schedules based on date + time, then filter past time slots
    const now = new Date();
    const nonExpiredAvailabilities = availabilities.filter(av => !isScheduleExpired(av));
    
    const filteredAvailabilities = await Promise.all(
      nonExpiredAvailabilities.map(av => filterPastTimeSlots(av))
    );

    res.status(200).json({
      success: true,
      count: filteredAvailabilities.length,
      availabilities: filteredAvailabilities
    });
  } catch (error) {
    console.error("Error fetching availabilities:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching availabilities",
      error: error.message
    });
  }
};

/**
 * Book a time slot
 */
exports.bookTimeSlot = async (req, res) => {
  try {
    const { doctorId, date, time, appointmentId } = req.body;

    if (!doctorId || !date || !time || !appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: doctorId, date, time, appointmentId"
      });
    }

    const availability = await DoctorAvailability.findOne({ doctorId, date });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: "Availability not found"
      });
    }

    // Find and update the slot
    const slot = availability.timeSlots.find(s => s.time === time);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found"
      });
    }

    if (slot.status === "booked") {
      return res.status(400).json({
        success: false,
        message: "Time slot is already booked"
      });
    }

    // Check if the slot time has passed (only for today)
    const today = new Date().toISOString().split('T')[0];
    if (date === today) {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTime = currentHours * 60 + currentMinutes;
      const slotTime = parseTimeToMinutes(time);
      
      if (slotTime !== null && slotTime < currentTime) {
        return res.status(400).json({
          success: false,
          message: "Cannot book a time slot that has already passed"
        });
      }
    }

    slot.status = "booked";
    slot.appointmentId = appointmentId;

    // Update counts
    const bookedCount = availability.timeSlots.filter(s => s.status === "booked").length;
    availability.bookedSlots = bookedCount.toString();
    availability.availableSlots = (parseInt(availability.totalSlots) - bookedCount).toString();
    availability.updatedAt = new Date();

    await availability.save();

    res.status(200).json({
      success: true,
      message: "Time slot booked successfully",
      availability
    });
  } catch (error) {
    console.error("Error booking time slot:", error);
    res.status(500).json({
      success: false,
      message: "Error booking time slot",
      error: error.message
    });
  }
};

/**
 * Delete a time slot from availability (only if not booked)
 */
exports.deleteTimeSlot = async (req, res) => {
  try {
    const { doctorId, date, time } = req.body;

    if (!doctorId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: doctorId, date, time"
      });
    }

    const availability = await DoctorAvailability.findOne({ doctorId, date });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: "Availability not found"
      });
    }

    // Find the slot
    const slotIndex = availability.timeSlots.findIndex(s => s.time === time);
    if (slotIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found"
      });
    }

    const slot = availability.timeSlots[slotIndex];

    // Only allow deletion if slot is available (not booked)
    if (slot.status === "booked") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a booked time slot"
      });
    }

    // Remove the slot
    availability.timeSlots.splice(slotIndex, 1);

    // Update counts
    const totalCount = availability.timeSlots.length;
    const bookedCount = availability.timeSlots.filter(s => s.status === "booked").length;
    availability.totalSlots = totalCount.toString();
    availability.bookedSlots = bookedCount.toString();
    availability.availableSlots = (totalCount - bookedCount).toString();
    availability.updatedAt = new Date();

    await availability.save();

    res.status(200).json({
      success: true,
      message: "Time slot deleted successfully",
      availability
    });
  } catch (error) {
    console.error("Error deleting time slot:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting time slot",
      error: error.message
    });
  }
};

/**
 * Delete entire availability for a specific date
 */
exports.deleteAvailabilityByDate = async (req, res) => {
  try {
    // Support both body and query parameters (some HTTP clients don't send body with DELETE)
    const doctorId = req.body?.doctorId || req.query?.doctorId;
    const date = req.body?.date || req.query?.date;

    console.log('DELETE availability request:', { doctorId, date, body: req.body, query: req.query });

    if (!doctorId || !date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: doctorId, date",
        received: { doctorId: !!doctorId, date: !!date }
      });
    }

    const availability = await DoctorAvailability.findOne({ doctorId, date });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: "Availability not found for this date"
      });
    }

    // Check if there are any booked slots
    const bookedSlots = availability.timeSlots.filter(s => s.status === "booked");
    if (bookedSlots.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete schedule. There are ${bookedSlots.length} booked appointment(s) for this date. Please cancel the appointments first.`
      });
    }

    // Log to Doctor_AppointmentActivity before deleting
    try {
      const DoctorAppointmentActivity = require("../models/DoctorAppointmentActivityModel");
      await DoctorAppointmentActivity.create({
        doctorId: availability.doctorId,
        date: availability.date,
        totalSlots: availability.totalSlots,
        bookedSlots: availability.bookedSlots,
        availableSlots: availability.availableSlots,
        action: 'deleted',
        notes: `Availability entry manually deleted by doctor`,
      });
    } catch (error) {
      console.error("Error logging activity:", error);
      // Continue with deletion even if logging fails
    }

    // Delete the availability
    await DoctorAvailability.findByIdAndDelete(availability._id);

    res.status(200).json({
      success: true,
      message: "Schedule deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting availability:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting schedule",
      error: error.message
    });
  }
};

/**
 * Delete expired availability entries
 */
exports.deleteExpiredAvailability = async () => {
  try {
    const DoctorAppointmentActivity = require("../models/DoctorAppointmentActivityModel");
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

    // Find all availability entries with dates before today
    const expiredEntries = await DoctorAvailability.find({
      date: { $lt: todayStr }
    });

    if (expiredEntries.length === 0) {
      console.log("No expired availability entries to delete");
      return { deleted: 0, logged: 0, entries: [] };
    }

    // Log each entry to Doctor_AppointmentActivity before deleting
    const activityLogs = [];
    for (const entry of expiredEntries) {
      try {
        const activityLog = await DoctorAppointmentActivity.create({
          doctorId: entry.doctorId,
          date: entry.date,
          totalSlots: entry.totalSlots,
          bookedSlots: entry.bookedSlots,
          availableSlots: entry.availableSlots,
          action: 'expired',
          notes: `Availability entry expired and deleted on ${todayStr}`,
        });
        activityLogs.push(activityLog);
      } catch (error) {
        console.error(`Error logging activity for entry ${entry._id}:`, error);
      }
    }

    // Delete expired entries
    const deleteResult = await DoctorAvailability.deleteMany({
      date: { $lt: todayStr }
    });

    console.log(`Deleted ${deleteResult.deletedCount} expired availability entries`);
    console.log(`Logged ${activityLogs.length} activities to Doctor_AppointmentActivity`);

    return {
      deleted: deleteResult.deletedCount,
      logged: activityLogs.length,
      entries: expiredEntries.map(e => ({
        _id: e._id.toString(),
        doctorId: e.doctorId,
        date: e.date,
        totalSlots: e.totalSlots,
        bookedSlots: e.bookedSlots
      }))
    };
  } catch (error) {
    console.error("Error deleting expired availability:", error);
    throw error;
  }
};

