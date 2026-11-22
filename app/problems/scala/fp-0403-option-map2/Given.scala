enum Option[+A]:
  case Some(get: A)
  case None

export Option.{Some, None}

extension [A](o: Option[A])
  def map[B](f: A => B): Option[B] = o match
    case Some(a) => Some(f(a))
    case None => None
  def flatMap[B](f: A => Option[B]): Option[B] = o match
    case Some(a) => f(a)
    case None => None
  def getOrElse[B >: A](default: => B): B = o match
    case Some(a) => a
    case None => default
  def orElse[B >: A](ob: => Option[B]): Option[B] = o match
    case Some(_) => o
    case None => ob
  def filter(f: A => Boolean): Option[A] = o match
    case Some(a) if f(a) => o
    case _ => None
