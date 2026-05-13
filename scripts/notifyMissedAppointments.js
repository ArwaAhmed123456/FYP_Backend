// scripts/notifyMissedAppointments.js
const connectDB = require('../config/db');
const DocAppointment = require('../models/DoctorAppointmentModel');
const PatientNotificationModel = require('../models/PatientNotificationModel');
const DoctorNotificationModel = require('../models/DoctorNotificationModel');
const Doctor = require('../models/DoctorModel');
const Patient = require('../models/PatientModel');

/**
 * Check for missed appointments and notify both patients and doctors
 * Missed appointments are those with status 'upcoming' where the appointment date has passed
 */
async function notifyMissedAppointments() {
  try {
    console.log('🔔 Starting missed appointments notification check...');
    
    await connectDB();
    
    // Get current datetime
    const now = new Date();
    
    // Find all appointments with status 'upcoming' that we need to check
    const upcomingAppointments = await DocAppointment.find({
      status: 'upcoming'
    })
      .populate('doctorId', 'DoctorName')
      .populate('patientId', 'firstName lastName');
    
    // Helper function to parse appointment datetime
    const parseAppointmentDateTime = (appointment) => {
      if (appointment.appointmentDate) {
        return new Date(appointment.appointmentDate);
      }
      
      // Try to get from appointment_date and appointment_time if available
      // Note: These fields might not exist in the model, but check if they're in the document
      if (appointment.appointment_date && appointment.appointment_time) {
        let timeStr = appointment.appointment_time.trim().replace(/\./g, ':');
        
        const match12Hour = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (match12Hour) {
          let hours = parseInt(match12Hour[1], 10);
          const minutes = parseInt(match12Hour[2], 10);
          const amPm = match12Hour[3].toUpperCase();
          
          if (amPm === 'PM' && hours !== 12) hours += 12;
          if (amPm === 'AM' && hours === 12) hours = 0;
          
          const dateTimeStr = `${appointment.appointment_date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
          return new Date(dateTimeStr);
        }
        
        const match24Hour = timeStr.match(/(\d{1,2}):(\d{2})/);
        if (match24Hour) {
          const hours = parseInt(match24Hour[1], 10);
          const minutes = parseInt(match24Hour[2], 10);
          const dateTimeStr = `${appointment.appointment_date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
          return new Date(dateTimeStr);
        }
      }
      
      if (appointment.appointment_date) {
        return new Date(appointment.appointment_date + 'T00:00:00');
      }
      
      return null;
    };
    
    // Filter to find missed appointments (datetime < now)
    const missedAppointments = upcomingAppointments.filter(apt => {
      const appointmentDateTime = parseAppointmentDateTime(apt);
      if (!appointmentDateTime) return false;
      
      // Appointment is missed if current datetime is strictly greater than appointment datetime
      return now > appointmentDateTime;
    });
    
    console.log(`📊 Found ${missedAppointments.length} missed appointment(s)`);
    
    if (missedAppointments.length === 0) {
      return {
        success: true,
        message: 'No missed appointments found',
        notificationsCreated: 0
      };
    }
    
    let patientNotificationsCreated = 0;
    let doctorNotificationsCreated = 0;
    let notificationsSkipped = 0;
    
    for (const appointment of missedAppointments) {
      try {
        const patientId = appointment.patientId?._id || appointment.patientId;
        const doctorId = appointment.doctorId?._id || appointment.doctorId;
        const appointmentId = appointment._id.toString();
        
        // Format appointment date and time (used for both notifications)
        const appointmentDate = new Date(appointment.appointmentDate);
        const formattedDate = appointmentDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        // Get appointment time if available
        let formattedTime = '';
        if (appointment.appointment_time) {
          // Try to format the time
          try {
            const timeStr = appointment.appointment_time;
            if (timeStr.includes('AM') || timeStr.includes('PM')) {
              formattedTime = timeStr;
            } else {
              // Convert 24-hour to 12-hour
              const [hours, minutes] = timeStr.split(':').map(Number);
              const period = hours >= 12 ? 'PM' : 'AM';
              const displayHours = hours % 12 || 12;
              formattedTime = `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
            }
          } catch (e) {
            formattedTime = appointment.appointment_time;
          }
        }
        
        const timeText = formattedTime ? ` at ${formattedTime}` : '';
        
        // Notify patient
        if (patientId) {
          try {
            // Check if patient notification already exists
            const patientNotificationExists = await PatientNotificationModel.notificationExistsForAppointment(
              patientId.toString(),
              appointmentId,
              'appointment_missed'
            );
            
            if (!patientNotificationExists) {
              // Get doctor name
              const doctorName = appointment.doctorId?.DoctorName || 'Doctor';
              
              // Create patient notification
              await PatientNotificationModel.createNotification({
                patientId: patientId.toString(),
                type: 'appointment_missed',
                title: 'Missed Appointment',
                description: `You missed your appointment with ${doctorName} scheduled for ${formattedDate}${timeText}. Please contact the clinic to reschedule.`,
                icon: 'alert-circle',
                appointmentId: appointmentId,
                doctorName: doctorName,
                timestamp: new Date()
              });
              
              console.log(`✅ Created missed appointment notification for patient ${patientId} (appointment ${appointmentId})`);
              patientNotificationsCreated++;
            }
          } catch (error) {
            console.error(`❌ Error creating patient notification for appointment ${appointmentId}:`, error.message);
            notificationsSkipped++;
          }
        }
        
        // Notify doctor
        if (doctorId) {
          try {
            // Check if doctor notification already exists
            const doctorNotificationExists = await DoctorNotificationModel.notificationExistsForAppointment(
              doctorId.toString(),
              appointmentId,
              'appointment_missed'
            );
            
            if (!doctorNotificationExists) {
              // Get patient name
              const patientName = appointment.patientId?.firstName && appointment.patientId?.lastName
                ? `${appointment.patientId.firstName} ${appointment.patientId.lastName}`.trim()
                : 'Patient';
              
              // Create doctor notification
              await DoctorNotificationModel.createNotification({
                doctorId: doctorId.toString(),
                type: 'appointment_missed',
                title: 'Missed Appointment',
                description: `Patient ${patientName} missed their appointment scheduled for ${formattedDate}${timeText}.`,
                icon: 'alert-circle',
                appointmentId: appointmentId,
                patientName: patientName,
                timestamp: new Date()
              });
              
              console.log(`✅ Created missed appointment notification for doctor ${doctorId} (appointment ${appointmentId})`);
              doctorNotificationsCreated++;
            }
          } catch (error) {
            console.error(`❌ Error creating doctor notification for appointment ${appointmentId}:`, error.message);
            notificationsSkipped++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing missed appointment ${appointment._id}:`, error.message);
        notificationsSkipped++;
      }
    }
    
    console.log(`✅ Missed appointments notification check completed:`);
    console.log(`   - Patient notifications created: ${patientNotificationsCreated}`);
    console.log(`   - Doctor notifications created: ${doctorNotificationsCreated}`);
    console.log(`   - Notifications skipped: ${notificationsSkipped}`);
    
    return {
      success: true,
      message: `Processed ${missedAppointments.length} missed appointment(s)`,
      patientNotificationsCreated,
      doctorNotificationsCreated,
      notificationsSkipped,
      totalMissed: missedAppointments.length
    };
  } catch (error) {
    console.error('❌ Error in notifyMissedAppointments:', error);
    throw error;
  }
}

// If run directly (not imported), execute the function
if (require.main === module) {
  notifyMissedAppointments()
    .then((result) => {
      console.log('📊 Final result:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = notifyMissedAppointments;

