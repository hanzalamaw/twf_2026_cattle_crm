import nodemailer from "nodemailer";

export const createEmailTransporter = () => {
  const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!emailUser || !emailPass) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
  return transporter;
};

export const sendPasswordEmail = async (email, newPassword) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "Your Password - TWF Cattle CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Password Recovery</h2>
          <p>You requested your password for your TWF Cattle CRM account.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your password is:</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold; color: #333; letter-spacing: 2px;">${newPassword}</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Please keep this password secure and change it after logging in.</p>
          <p style="color: #999; font-size: 12px;">If you didn't request this, please contact support immediately.</p>
        </div>
      `,
      text: `Password Recovery\n\nYour password is: ${newPassword}\n\nPlease keep this password secure and change it after logging in.\n\nIf you didn't request this, please contact support immediately.`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error.message);
    return false;
  }
};

export const sendResetLinkEmail = async (email, resetLink) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "Reset Your Password - TWF Cattle CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Reset Your Password</h2>
          <p>You requested to reset your password for your TWF Cattle CRM account.</p>
          <p>Click the link below to choose a new password. This link expires in 1 hour.</p>
          <div style="margin: 24px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: #FF5722; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 12px;">Or copy and paste this link into your browser:</p>
          <p style="color: #333; font-size: 12px; word-break: break-all;">${resetLink}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this, you can ignore this email. Your password will not be changed.</p>
        </div>
      `,
      text: `Reset Your Password\n\nClick the link below to choose a new password (expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Reset link email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending reset link email:", error.message);
    return false;
  }
};

export const sendLoginNotificationEmail = async (email) => {
  try {
    const transporter = createEmailTransporter();
    if (!transporter) {
      console.warn("Email not configured. Please set SMTP_USER and SMTP_PASS in .env file");
      return false;
    }
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || "noreply@twfcattlecrm.com",
      to: email,
      subject: "You just logged in - TWF Cattle CRM",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF5722;">Login notification</h2>
          <p>You just logged in to your TWF Cattle CRM account.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">If this wasn't you, please change your password and contact support.</p>
        </div>
      `,
      text: "You just logged in to your TWF Cattle CRM account.\n\nIf this wasn't you, please change your password and contact support."
    };
    const info = await transporter.sendMail(mailOptions);
    console.log("Login notification email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending login notification email:", error.message);
    return false;
  }
};
