enum MyList[+A]:
  case Empty
  case Cons(head: A, tail: MyList[A])

  def +:[B >: A](x: B): MyList[B] = Cons(x, this)

  def toList: List[A] = this match
    case Empty => Nil
    case Cons(h, t) => h :: t.toList

import MyList.*
